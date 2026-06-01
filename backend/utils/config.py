"""Configuration loader for the RAG-Chatbot-Starter backend.

Loads environment variables from `.env` and provides default values.
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# AI Provider Credentials
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# AI Model Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o-mini")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-3-small")

# Fallback: Redirect standard OpenAI client endpoints to Google's official OpenAI-compatible endpoint
# if GEMINI_API_KEY is supplied but OPENAI_API_KEY is left blank
if not OPENAI_API_KEY and GEMINI_API_KEY:
    OPENAI_API_KEY = GEMINI_API_KEY
    if OPENAI_API_BASE == "https://api.openai.com/v1":
        OPENAI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"
    
    # Apply standard model fallbacks if default GPT models are configured
    if MODEL_NAME == "gpt-4o-mini":
        MODEL_NAME = "gemini-1.5-flash"
    if EMBEDDING_MODEL_NAME == "text-embedding-3-small":
        EMBEDDING_MODEL_NAME = "text-embedding-004"

# Custom Chatbot Branding
CHATBOT_NAME = os.getenv("CHATBOT_NAME", "My AI Assistant")
PRIMARY_COLOR = os.getenv("PRIMARY_COLOR", "#2563eb")
WELCOME_MESSAGE = os.getenv("WELCOME_MESSAGE", "Hello! I am your AI assistant, trained on your custom knowledge base. How can I help you today?")

# RAG Toggle
_enable_rag_str = os.getenv("ENABLE_RAG", "true").lower()
is_rag_enabled = _enable_rag_str in ("true", "1", "yes", "on")

# Security Config
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_jwt_signing_key_change_me_in_production")
