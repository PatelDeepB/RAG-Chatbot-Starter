"""CLI ingestion script to process knowledge base documents and update the vector index.
"""

import os
import sys
from backend.rag.document_loader import load_document
from backend.rag.text_splitter import split_documents
from backend.rag.vector_store import SimpleVectorStore

DOCS_DIR = os.path.join("data", "documents")


def main() -> None:
    """Main execution function to index documents from the documents directory.
    """
    print("🚀 Starting knowledge base ingestion...")
    
    # Ensure documents directory exists
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR, exist_ok=True)
        print(f"📁 Created documents directory at '{DOCS_DIR}'. Please place files inside and run again.")
        return

    # List all files in documents directory
    files = [
        f for f in os.listdir(DOCS_DIR) 
        if os.path.isfile(os.path.join(DOCS_DIR, f)) and not f.startswith(".")
    ]

    if not files:
        print(f"⚠️ No documents found in '{DOCS_DIR}'. Place PDF, TXT, or MD files there.")
        return

    print(f"📚 Found {len(files)} file(s) to process: {', '.join(files)}")

    # Initialize Vector Store
    try:
        store = SimpleVectorStore()
    except ValueError as e:
        print(f"❌ Initialization Error: {e}")
        print("💡 Please set the OPENAI_API_KEY environment variable.")
        sys.exit(1)

    print("🧹 Clearing existing index database...")
    store.clear()

    all_loaded_docs = []
    
    for file_name in files:
        file_path = os.path.join(DOCS_DIR, file_name)
        print(f"⏳ Reading file: {file_name}...")
        
        try:
            docs = load_document(file_path)
            if not docs:
                print(f"⚠️ Warning: No text could be extracted from {file_name}.")
                continue
            
            all_loaded_docs.extend(docs)
            print(f"✅ Extracted {len(docs)} logical section(s)/page(s).")
        except Exception as e:
            print(f"❌ Failed to process {file_name}: {e}")

    if not all_loaded_docs:
        print("⚠️ No valid text chunks were loaded. Ingestion cancelled.")
        return

    print(f"✂️ Splitting documents into chunk chunks...")
    chunks = split_documents(all_loaded_docs, chunk_size=800, chunk_overlap=150)
    print(f"✅ Generated {len(chunks)} split chunks.")

    print(f"🧠 Generating embeddings via API (this may take a few moments)...")
    try:
        store.add_documents(chunks)
        print("🎉 Ingestion complete! Vector store has been indexed and saved successfully.")
    except Exception as e:
        print(f"❌ Embedding Generation Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
