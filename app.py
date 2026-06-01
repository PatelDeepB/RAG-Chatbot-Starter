"""Main FastAPI application bootstrap.

Sets up middleware, mounts static frontend assets, integrates API routes, 
and handles server startup sanity checks.
"""

import os
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.api.routes import router as api_router

# Initialize FastAPI App
app = FastAPI(
    title="RAG-Chatbot-Starter API",
    description="A production-ready open-source RAG chatbot API server.",
    version="1.0.0"
)

# Configure CORS Middleware (crucial for local development & modular calls)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Open by default for developer flexibility
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Integrate the API router
app.include_router(api_router, prefix="/api")


@app.on_event("startup")
def startup_checks():
    """Validates that necessary runtime directories exist on start.
    
    Performs database recovery by clearing any stuck "indexing" statuses.
    """
    os.makedirs(os.path.join("data", "documents"), exist_ok=True)
    os.makedirs(os.path.join("frontend", "assets"), exist_ok=True)
    os.makedirs(os.path.join("frontend", "components"), exist_ok=True)
    os.makedirs(os.path.join("frontend", "styles"), exist_ok=True)
    os.makedirs(os.path.join("frontend", "pages"), exist_ok=True)
    print("📁 Runtime storage directories successfully verified.")
    
    # Recovery check: clean up stuck "indexing" states on boot
    import json
    status_path = os.path.join("data", "documents_status.json")
    if os.path.exists(status_path):
        try:
            with open(status_path, "r", encoding="utf-8") as f:
                status_data = json.load(f)
            
            modified = False
            for doc, stat in status_data.items():
                if stat == "indexing":
                    status_data[doc] = "failed: Ingestion interrupted on server restart"
                    modified = True
                    
            if modified:
                with open(status_path, "w", encoding="utf-8") as f:
                    json.dump(status_data, f, indent=2)
                print("🧹 Cleaned up lingering 'indexing' statuses from previous session.")
        except Exception as e:
            print(f"Warning: Startup recovery status check failed: {e}")


# Mount Frontend assets to serve them cleanly with absolute URLs
# This maps 'frontend/styles' to '/styles', 'frontend/components' to '/components', etc.
try:
    app.mount("/styles", StaticFiles(directory="frontend/styles"), name="styles")
    app.mount("/components", StaticFiles(directory="frontend/components"), name="components")
    app.mount("/assets", StaticFiles(directory="frontend/assets"), name="assets")
except Exception as e:
    print(f"Warning: Static files mounting encountered a minor issue: {e}")


@app.get("/")
def read_root():
    """Serves the main single-page application interface.
    """
    index_path = os.path.join("frontend", "pages", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    # Fallback response if the file isn't created yet
    return {
        "status": "online",
        "message": "FastAPI is running successfully! UI file (frontend/pages/index.html) is currently missing."
    }


# Catch-all route to serve index.html for frontend routing (if needed)
@app.get("/{full_path:path}")
def read_all_other_paths(full_path: str):
    """Fallback handler to support SPA page refresh behaviors.
    """
    # Ignore API routes and direct static file requests
    if full_path.startswith("api") or "." in full_path:
        file_path = os.path.join("frontend", full_path)
        if os.path.exists(file_path):
            return FileResponse(file_path)
        raise HTTPException(status_code=404, detail="File Not Found")
        
    index_path = os.path.join("frontend", "pages", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
        
    raise HTTPException(status_code=404, detail="Not Found")


if __name__ == "__main__":
    # Allows running directly via `python app.py`
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
