"""API Endpoints router for handling chat streaming, document management,
authentication, and custom configuration options.
"""

import os
import hmac
import hashlib
import time
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.utils import config
from backend.services.llm import LLMService
from backend.rag.document_loader import load_document
from backend.rag.text_splitter import split_documents
from backend.rag.vector_store import SimpleVectorStore

router = APIRouter()
llm_service = LLMService()

# --- Security & Session Tokens ---

def generate_admin_token() -> str:
    """Generates a secure administrative session token using HMAC-SHA256.
    
    Returns:
        A token string containing a timestamp and digital signature.
    """
    timestamp = str(int(time.time()))
    payload = f"admin:{timestamp}"
    signature = hmac.new(
        config.JWT_SECRET.encode(), 
        payload.encode(), 
        hashlib.sha256
    ).hexdigest()
    return f"{payload}:{signature}"


def verify_admin_token(token: str) -> bool:
    """Verifies the signature and expiration time of a session token.
    
    Args:
        token: The token string to check.
        
    Returns:
        True if the signature matches and token is within 24 hours of creation.
    """
    if not token:
        return False
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False
            
        role, timestamp, signature = parts
        if role != "admin":
            return False
            
        # Re-compute signature to check validity
        payload = f"{role}:{timestamp}"
        expected_signature = hmac.new(
            config.JWT_SECRET.encode(), 
            payload.encode(), 
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            return False
            
        # Token valid for 24 hours
        token_age = time.time() - int(timestamp)
        return 0 <= token_age <= 86400
    except Exception:
        return False


def get_current_admin(authorization: Optional[str] = Header(None)) -> str:
    """Dependency to validate authorization headers and return admin status.
    
    Args:
        authorization: HTTP Authorization header value.
        
    Returns:
        Role 'admin' if valid.
        
    Raises:
        HTTPException: 401 if token is invalid or missing.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header. Use Bearer token."
        )
        
    token = authorization.split(" ")[1]
    if not verify_admin_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token is invalid or expired."
        )
    return "admin"

# --- Models ---

class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the speaker (user, assistant)")
    content: str = Field(..., description="Content text of the message")


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="List of conversations in history")
    enable_rag: bool = Field(True, alias="enableRag", description="Toggle document retrieval matching")


class LoginRequest(BaseModel):
    password: str = Field(..., description="Admin login credentials password")

# --- Background Task ---

def background_reindex_store():
    """Performs full corpus ingestion and indexing in the background with atomic safe overrides.
    """
    import json
    print("⏳ Background Task: Reindexing vector store...")
    docs_dir = os.path.join("data", "documents")
    status_path = os.path.join("data", "documents_status.json")
    
    if not os.path.exists(docs_dir):
        return
        
    files = [
        f for f in os.listdir(docs_dir) 
        if os.path.isfile(os.path.join(docs_dir, f)) and not f.startswith(".")
    ]
    
    # 1. Initialize status database
    status_data = {}
    if os.path.exists(status_path):
        try:
            with open(status_path, "r", encoding="utf-8") as f:
                status_data = json.load(f)
        except Exception:
            pass
            
    # Mark files currently indexing
    for f in files:
        if status_data.get(f) != "indexed":
            status_data[f] = "indexing"
            
    try:
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(status_data, f, indent=2)
    except Exception:
        pass

    try:
        # Load and parse all documents
        all_docs = []
        for file_name in files:
            file_path = os.path.join(docs_dir, file_name)
            docs = load_document(file_path)
            if docs:
                all_docs.extend(docs)
                
        # If no documents are present, simply clear the active store
        if not files:
            store = SimpleVectorStore()
            store.clear()
            # Clear status file
            with open(status_path, "w", encoding="utf-8") as f:
                json.dump({}, f, indent=2)
            print("📁 Background Task: No documents found. Vector index cleared.")
            return

        if all_docs:
            chunks = split_documents(all_docs, chunk_size=800, chunk_overlap=150)
            
            # Temporary store to perform embedding generation (throws error if API key is invalid)
            temp_store = SimpleVectorStore()
            texts = [c["text"] for c in chunks]
            embeddings = temp_store.get_embeddings(texts)
            
            # Since embedding generation succeeded, we can now safely clear and replace active on-disk store!
            store = SimpleVectorStore()
            store.chunks = []
            store.embeddings = []
            
            for chunk, emb in zip(chunks, embeddings):
                store.chunks.append({
                    "text": chunk["text"],
                    "metadata": chunk["metadata"]
                })
                store.embeddings.append(emb)
                
            store.save()
            
            # Update all files to "indexed"
            new_status = {f: "indexed" for f in files}
            with open(status_path, "w", encoding="utf-8") as f:
                json.dump(new_status, f, indent=2)
                
            print(f"✅ Background Task: Successfully indexed {len(chunks)} chunks.")
        else:
            # Files were empty or unreadable
            new_status = {f: "failed: No readable text found" for f in files}
            with open(status_path, "w", encoding="utf-8") as f:
                json.dump(new_status, f, indent=2)
                
    except Exception as e:
        err_msg = str(e)
        if "invalid_api_key" in err_msg.lower():
            err_msg = "failed: Invalid API Key in .env"
        elif "rate_limit" in err_msg.lower():
            err_msg = "failed: OpenAI rate limit exceeded"
        else:
            err_msg = f"failed: {err_msg}"
            
        print(f"❌ Background Task: Reindexing failed: {err_msg}")
        
        # Write failures to status JSON
        new_status = {}
        try:
            store = SimpleVectorStore()
            indexed_sources = {chunk["metadata"].get("source") for chunk in store.chunks}
        except Exception:
            indexed_sources = set()
            
        for f in files:
            # If it was already indexed in a prior run, preserve its indexed status
            if f in indexed_sources:
                new_status[f] = "indexed"
            else:
                new_status[f] = err_msg
                
        try:
            with open(status_path, "w", encoding="utf-8") as f:
                json.dump(new_status, f, indent=2)
        except Exception:
            pass

# --- Endpoints ---

@router.get("/config")
def get_branding_config():
    """Exposes customization properties and status variables.
    """
    return {
        "chatbotName": config.CHATBOT_NAME,
        "primaryColor": config.PRIMARY_COLOR,
        "welcomeMessage": config.WELCOME_MESSAGE,
        "isRagEnabled": config.is_rag_enabled,
        "hasApiKey": bool(config.OPENAI_API_KEY)
    }


@router.post("/auth/login")
def admin_login(payload: LoginRequest):
    """Authenticates administrative password and outputs secure Bearer tokens.
    """
    if payload.password != config.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect administrative password."
        )
        
    token = generate_admin_token()
    return {
        "token": token,
        "role": "admin"
    }


@router.get("/auth/status")
def check_auth_status(admin_role: str = Depends(get_current_admin)):
    """Verifies whether client has a valid administration session.
    """
    return {"status": "authenticated", "role": admin_role}


@router.post("/chat")
async def chat_completion(request: ChatRequest):
    """Processes queries, performs retrieval, and yields SSE response streams.
    """
    # Parse list of message dictionaries
    history = [msg.model_dump() for msg in request.messages]
    
    # Generate response streaming with Server-Sent Events (SSE)
    async_generator = llm_service.generate_response_stream(
        messages=history,
        enable_rag=request.enable_rag
    )
    
    return StreamingResponse(
        async_generator, 
        media_type="text/event-stream"
    )

# --- Document Operations ---

@router.get("/documents")
def list_documents(admin_role: str = Depends(get_current_admin)):
    """Returns a list of all documents currently residing in the storage folder with status checks.
    """
    import json
    docs_dir = os.path.join("data", "documents")
    status_path = os.path.join("data", "documents_status.json")
    os.makedirs(docs_dir, exist_ok=True)
    
    files = [
        f for f in os.listdir(docs_dir) 
        if os.path.isfile(os.path.join(docs_dir, f)) and not f.startswith(".")
    ]
    
    status_data = {}
    if os.path.exists(status_path):
        try:
            with open(status_path, "r", encoding="utf-8") as f:
                status_data = json.load(f)
        except Exception:
            pass
            
    results = []
    for f in files:
        file_path = os.path.join(docs_dir, f)
        stat = os.stat(file_path)
        
        # Check specific status or fall back
        file_status = status_data.get(f)
        if not file_status:
            try:
                store = SimpleVectorStore()
                indexed_sources = {chunk["metadata"].get("source") for chunk in store.chunks}
                file_status = "indexed" if f in indexed_sources else "indexing"
            except Exception:
                file_status = "indexing"
                
        results.append({
            "name": f,
            "sizeBytes": stat.st_size,
            "status": file_status,
            "modifiedTime": stat.st_mtime
        })
        
    return results


@router.post("/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    admin_role: str = Depends(get_current_admin)
):
    """Uploads file to store directory and schedules background re-indexing.
    """
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in (".pdf", ".txt", ".md", ".markdown"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Only PDF, TXT, and Markdown are accepted."
        )
        
    docs_dir = os.path.join("data", "documents")
    os.makedirs(docs_dir, exist_ok=True)
    
    safe_filename = os.path.basename(file.filename)
    target_path = os.path.join(docs_dir, safe_filename)
    
    try:
        with open(target_path, "wb") as buffer:
            contents = await file.read()
            buffer.write(contents)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write file to disk: {e}"
        )
        
    # Trigger background vector rebuild
    background_tasks.add_task(background_reindex_store)
    
    return {
        "status": "success",
        "message": f"File '{safe_filename}' uploaded. Background reindexing scheduled."
    }


@router.delete("/documents/{filename}")
def delete_document(
    filename: str,
    background_tasks: BackgroundTasks,
    admin_role: str = Depends(get_current_admin)
):
    """Deletes the specified file from storage and triggers re-indexing.
    """
    docs_dir = os.path.join("data", "documents")
    safe_filename = os.path.basename(filename)
    target_path = os.path.join(docs_dir, safe_filename)
    
    if not os.path.exists(target_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{safe_filename}' not found."
        )
        
    try:
        os.remove(target_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file from disk: {e}"
        )
        
    # Trigger background vector rebuild
    background_tasks.add_task(background_reindex_store)
    
    return {
        "status": "success",
        "message": f"File '{safe_filename}' deleted. Background reindexing scheduled."
    }
