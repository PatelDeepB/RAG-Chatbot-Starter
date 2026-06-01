"""A simple, robust, custom Vector Store utilizing standard OpenAI Embeddings API
and NumPy for local vector similarity search.
"""

import os
import json
from typing import List, Dict, Any, Tuple
import numpy as np
from openai import OpenAI
from backend.utils import config


class SimpleVectorStore:
    """A lightweight vector database that runs entirely in-memory and saves to a JSON file.
    
    Uses standard OpenAI embeddings and NumPy for fast cosine similarity.
    """
    
    def __init__(self, db_path: str = "data/vector_store.json"):
        """Initializes the vector store and loads existing embeddings.
        
        Args:
            db_path: Path to store/load the vector store database file.
        """
        self.db_path = db_path
        self.chunks: List[Dict[str, Any]] = []
        self.embeddings: List[List[float]] = []
        
        # Ensure directories exist
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.load()
        
    def _get_client(self) -> OpenAI:
        """Helper to create and return the OpenAI API client using configured keys.
        
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

    def load(self) -> None:
        """Loads vector store data from disk if it exists."""
        if not os.path.exists(self.db_path):
            self.chunks = []
            self.embeddings = []
            return
            
        try:
            with open(self.db_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.chunks = data.get("chunks", [])
                self.embeddings = data.get("embeddings", [])
        except Exception as e:
            print(f"Warning: Failed to load vector store from {self.db_path}: {e}")
            self.chunks = []
            self.embeddings = []

    def save(self) -> None:
        """Saves current memory index and embeddings to disk."""
        try:
            with open(self.db_path, "w", encoding="utf-8") as f:
                json.dump({
                    "chunks": self.chunks,
                    "embeddings": self.embeddings
                }, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving vector store: {e}")

    def clear(self) -> None:
        """Clears the vector database entirely."""
        self.chunks = []
        self.embeddings = []
        self.save()

    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Queries OpenAI Embeddings API for a list of input texts.
        
        Args:
            texts: List of text blocks to embed.
            
        Returns:
            A list of floating-point embedding vectors.
        """
        if not texts:
            return []
            
        client = self._get_client()
        response = client.embeddings.create(
            input=texts,
            model=config.EMBEDDING_MODEL_NAME
        )
        return [item.embedding for item in response.data]

    def add_documents(self, documents: List[Dict[str, Any]]) -> None:
        """Embeds and indexes a list of document chunks.
        
        Args:
            documents: List of dicts, each with 'text' and 'metadata'.
        """
        if not documents:
            return
            
        texts = [doc["text"] for doc in documents]
        new_embeddings = self.get_embeddings(texts)
        
        for doc, emb in zip(documents, new_embeddings):
            self.chunks.append({
                "text": doc["text"],
                "metadata": doc["metadata"]
            })
            self.embeddings.append(emb)
            
        self.save()

    def similarity_search(self, query: str, k: int = 4) -> List[Dict[str, Any]]:
        """Finds the top-k most similar document chunks matching a search query.
        
        Args:
            query: The question or search terms.
            k: The maximum number of matches to retrieve.
            
        Returns:
            List of matching document chunks with 'text', 'metadata', and 'similarity'.
        """
        if not self.embeddings or not query:
            return []
            
        # Get query vector
        query_vector = self.get_embeddings([query])[0]
        
        # Calculate cosine similarities using NumPy
        query_arr = np.array(query_vector)
        embeddings_arr = np.array(self.embeddings)
        
        # Cosine similarity formula: dot(A, B) / (norm(A) * norm(B))
        dot_products = np.dot(embeddings_arr, query_arr)
        norms_emb = np.linalg.norm(embeddings_arr, axis=1)
        norm_query = np.linalg.norm(query_arr)
        
        # Prevent division by zero
        norms_emb[norms_emb == 0] = 1e-10
        norm_query = 1e-10 if norm_query == 0 else norm_query
        
        similarities = dot_products / (norms_emb * norm_query)
        
        # Get top-k indices
        top_k_indices = np.argsort(similarities)[::-1][:k]
        
        results = []
        for idx in top_k_indices:
            # Only return matches that have a decent similarity score (e.g. > 0.0)
            score = float(similarities[idx])
            results.append({
                "text": self.chunks[idx]["text"],
                "metadata": self.chunks[idx]["metadata"],
                "similarity": score
            })
            
        return results
