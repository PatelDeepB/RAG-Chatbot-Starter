"""Service for interfacing with OpenAI-compatible chat completion APIs
and orchestrating RAG context injection.
"""

import json
from typing import AsyncGenerator, List, Dict, Any
from openai import OpenAI
from backend.utils import config
from backend.rag.vector_store import SimpleVectorStore

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None


class LLMService:
    """Orchestrates communication with the LLM API and handles RAG queries.
    """
    
    def __init__(self):
        """Initializes the LLM service and preloads the vector store.
        """
        self.store = None
        if config.is_rag_enabled:
            try:
                self.store = SimpleVectorStore()
            except Exception as e:
                print(f"Warning: RAG was enabled but vector store failed to initialize: {e}")

    def _get_client(self) -> OpenAI:
        """Helper to create and return the OpenAI API client.
        
        Returns:
            An authenticated OpenAI client instance.
        """
        if not config.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY is not configured. Please define it in your .env file."
            )
        return OpenAI(
            api_key=config.OPENAI_API_KEY,
            base_url=config.OPENAI_API_BASE
        )

    async def generate_response_stream(
        self, 
        messages: List[Dict[str, str]], 
        enable_rag: bool = True
    ) -> AsyncGenerator[str, None]:
        """Streams LLM chat completions with injected RAG context.
        
        Yields Server-Sent Events (SSE) structured messages:
        1. 'sources' event: containing citations and source documents.
        2. 'delta' event: containing text tokens as they arrive.
        3. 'done' event: signaling end of stream.
        
        Args:
            messages: Conversation history, last message is the user's latest query.
            enable_rag: Toggle RAG matching for this specific generation.
            
        Yields:
            SSE formatted strings.
        """
        if not messages:
            yield "event: error\ndata: No messages provided\n\n"
            return
            
        client = self._get_client()
        user_query = messages[-1]["content"]
        
        sources = []
        rag_context = ""
        
        # 1. Retrieve RAG context if enabled
        if config.is_rag_enabled and enable_rag and self.store:
            try:
                # Retrieve top 4 matching blocks
                matches = self.store.similarity_search(user_query, k=4)
                
                if matches:
                    context_blocks = []
                    for match in matches:
                        # Only use matches with positive relevance
                        if match.get("similarity", 0) > 0.05:
                            sources.append({
                                "text": match["text"],
                                "metadata": match["metadata"],
                                "similarity": match["similarity"]
                            })
                            
                            source_name = match["metadata"].get("source", "Unknown Source")
                            page_info = f", Page {match['metadata']['page']}" if "page" in match["metadata"] else ""
                            context_blocks.append(
                                f"--- START SOURCE CHUNK ({source_name}{page_info}) ---\n"
                                f"{match['text']}\n"
                                f"--- END SOURCE CHUNK ---"
                            )
                            
                    if context_blocks:
                        rag_context = "\n\n".join(context_blocks)
            except Exception as e:
                print(f"Error during vector similarity search: {e}")
                
        # Send sources to client first
        yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
        
        # 2. Construct prompt system messages
        system_instruction = (
            "You are a helpful, professional, and friendly AI assistant. "
            "You have access to a custom knowledge base to answer the user's questions."
        )
        
        if rag_context:
            system_instruction += (
                "\n\nUse the following retrieved context chunks to answer the user's question. "
                "Keep your answers accurate, grounded, and concise. "
                "Always cite your sources if the information comes from the context (e.g. [Source: filename.pdf] or [Source: doc.pdf, Page 3]). "
                "If the context does not contain the answer, politely explain that you do not know "
                "or that the documents do not specify, rather than fabricating details.\n\n"
                f"=== RETRIEVED CONTEXT ===\n{rag_context}\n=========================="
            )
            
        # If active provider is gemini, stream natively using modern google-genai SDK
        if config.AI_PROVIDER == "gemini":
            if not genai:
                err_msg = "google-genai SDK is not installed but AI_PROVIDER is set to gemini."
                yield f"event: error\ndata: {json.dumps(err_msg)}\n\n"
                return
                
            gemini_contents = []
            for msg in messages:
                role = "user" if msg["role"] == "user" else "model"
                gemini_contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=msg["content"])]
                    )
                )
                
            try:
                gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)
                stream = gemini_client.models.generate_content_stream(
                    model=config.MODEL_NAME,
                    contents=gemini_contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction
                    )
                )
                
                for chunk in stream:
                    delta = chunk.text
                    if delta:
                        yield f"event: delta\ndata: {json.dumps(delta)}\n\n"
                        
                yield "event: done\ndata: [DONE]\n\n"
            except Exception as e:
                err_msg = f"API Error: {str(e)}"
                yield f"event: error\ndata: {json.dumps(err_msg)}\n\n"
            return
            
        # Copy and format message list
        formatted_messages = [{"role": "system", "content": system_instruction}]
        
        # Append all historical user and assistant messages (excluding any preexisting system instructions)
        for msg in messages:
            if msg["role"] in ("user", "assistant"):
                formatted_messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
                
        # 3. Stream from OpenAI-compatible completion endpoint
        try:
            stream = client.chat.completions.create(
                model=config.MODEL_NAME,
                messages=formatted_messages,
                stream=True
            )
            
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else ""
                if delta:
                    # Escape text values correctly for SSE format
                    yield f"event: delta\ndata: {json.dumps(delta)}\n\n"
                    
            yield "event: done\ndata: [DONE]\n\n"
        except Exception as e:
            err_msg = f"API Error: {str(e)}"
            yield f"event: error\ndata: {json.dumps(err_msg)}\n\n"
