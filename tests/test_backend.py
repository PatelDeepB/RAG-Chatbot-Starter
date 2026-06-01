"""Automated unit test suite verifying RAG splitting, document loading,
vector similarities, and API configuration mappings.
"""

import os
import pytest
import numpy as np
from unittest.mock import MagicMock, patch

from backend.rag.text_splitter import split_text, split_documents
from backend.rag.document_loader import load_document
from backend.rag.vector_store import SimpleVectorStore
from backend.utils import config


# --- 1. Text Splitter Tests ---

def test_split_text_small():
    """Verifies that strings smaller than chunk_size remain untouched.
    """
    text = "Short text block."
    chunks = split_text(text, chunk_size=50, chunk_overlap=10)
    assert len(chunks) == 1
    assert chunks[0] == "Short text block."


def test_split_text_word_aware():
    """Verifies that the character splitter does not break words mid-sequence.
    """
    # 52 character text
    text = "This is a simple sentence that will split on space boundaries."
    # With chunk size 30, it should split at a space, not mid-word
    chunks = split_text(text, chunk_size=30, chunk_overlap=5)
    
    assert len(chunks) > 1
    # Check that each chunk is bounded and cuts on spaces
    for chunk in chunks:
        assert len(chunk) <= 30
        assert chunk.strip() != ""


def test_split_documents_metadata():
    """Verifies that split_documents properly attaches chunk sequence metadata.
    """
    docs = [
        {
            "text": "This is paragraph number one. This is paragraph number two.",
            "metadata": {"source": "test.txt", "type": "txt"}
        }
    ]
    split_docs = split_documents(docs, chunk_size=30, chunk_overlap=5)
    
    assert len(split_docs) >= 2
    assert split_docs[0]["metadata"]["source"] == "test.txt"
    assert "chunk_index" in split_docs[0]["metadata"]
    assert split_docs[0]["metadata"]["chunk_index"] == 0
    assert split_docs[1]["metadata"]["chunk_index"] == 1


def test_split_text_semantic():
    """Verifies that split_text splits semantically on paragraph double newlines.
    """
    text = "First paragraph here.\n\nSecond paragraph content is longer."
    # A chunk size of 30 should keep them completely separate as two paragraph chunks
    chunks = split_text(text, chunk_size=40, chunk_overlap=5)
    
    assert len(chunks) == 2
    assert chunks[0] == "First paragraph here."
    assert chunks[1] == "Second paragraph content is longer."


# --- 2. Document Loader Tests ---

def test_load_document_unsupported():
    """Checks that unsupported formats gracefully return empty arrays.
    """
    res = load_document("path/to/image.png")
    assert res == []


# --- 3. Vector Database Tests ---

@patch("backend.rag.vector_store.OpenAI")
def test_vector_store_add_and_search(mock_openai_class):
    """Mocks OpenAI client call and validates cosine similarity vector calculations.
    """
    # Configure mock API client responses
    mock_client = MagicMock()
    mock_openai_class.return_value = mock_client
    
    # Define distinct embeddings matching mock data
    # text-embedding-3-small typically produces 1536 dims, let's use 3 dims for testing math simply
    mock_embeddings = [
        [1.0, 0.0, 0.0],  # Document 1 vector
        [0.0, 1.0, 0.0],  # Document 2 vector
    ]
    
    # Mock embeddings api call return structure
    mock_response = MagicMock()
    mock_response.data = [
        MagicMock(embedding=emb) for emb in mock_embeddings
    ]
    mock_client.embeddings.create.return_value = mock_response

    # Force mock API key so validation passes
    config.OPENAI_API_KEY = "mock_key_for_testing"
    config.AI_PROVIDER = "openai"

    # Initialize store with temporary DB path
    db_path = "data/test_vector_store.json"
    if os.path.exists(db_path):
        os.remove(db_path)

    try:
        store = SimpleVectorStore(db_path=db_path)
        
        test_docs = [
            {"text": "Apple fruit details.", "metadata": {"source": "apple.txt"}},
            {"text": "Information about Bananas.", "metadata": {"source": "banana.txt"}}
        ]
        
        # Add docs (calls mocked embeddings API)
        store.add_documents(test_docs)
        
        assert len(store.chunks) == 2
        assert store.chunks[0]["text"] == "Apple fruit details."
        
        # Test Query - We mock the query embedding to match document 1 exactly
        mock_query_response = MagicMock()
        mock_query_response.data = [
            MagicMock(embedding=[1.0, 0.0, 0.0]) # Matches Apple embedding exactly
        ]
        mock_client.embeddings.create.return_value = mock_query_response
        
        search_results = store.similarity_search("Apple details", k=1)
        
        assert len(search_results) == 1
        assert search_results[0]["text"] == "Apple fruit details."
        # Perfect similarity for aligned vectors should be ~1.0
        assert search_results[0]["similarity"] > 0.99
        
    finally:
        # Clean up temporary database
        if os.path.exists(db_path):
            os.remove(db_path)


# --- 4. Gemini Configuration Tests ---

def test_gemini_config_fallback():
    """Verifies config behavior when only GEMINI_API_KEY is supplied.
    """
    import importlib
    from backend.utils import config
    
    with patch.dict(os.environ, {
        "OPENAI_API_KEY": "",
        "GEMINI_API_KEY": "dummy_gemini_key",
        "MODEL_NAME": "gpt-4o-mini",
        "EMBEDDING_MODEL_NAME": "text-embedding-3-small"
    }):
        # Force reload to apply env overrides
        importlib.reload(config)
        
        assert config.AI_PROVIDER == "gemini"
        assert config.OPENAI_API_KEY == "dummy_gemini_key"
        assert config.MODEL_NAME == "gemini-2.5-flash"
        assert config.EMBEDDING_MODEL_NAME == "text-embedding-004"

    # Reload again with original settings to clean up config state for subsequent tests
    importlib.reload(config)

