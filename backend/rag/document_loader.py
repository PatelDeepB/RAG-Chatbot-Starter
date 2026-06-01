"""Document loader for extracting text from PDF, TXT, and Markdown files.
"""

import os
from typing import Dict, List, Any
from pypdf import PdfReader


def read_text_file(file_path: str) -> str:
    """Reads a text file and returns its content.
    
    Args:
        file_path: Path to the text file.
        
    Returns:
        The content of the file.
    """
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def load_pdf(file_path: str) -> List[Dict[str, Any]]:
    """Loads a PDF file and extracts text page by page.
    
    Args:
        file_path: Absolute or relative path to the PDF file.
        
    Returns:
        List of dictionaries containing extracted page text and page metadata.
    """
    documents = []
    file_name = os.path.basename(file_path)
    
    try:
        reader = PdfReader(file_path)
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            stripped_text = page_text.strip()
            
            if not stripped_text:
                continue
                
            documents.append({
                "text": stripped_text,
                "metadata": {
                    "source": file_name,
                    "page": i + 1,
                    "type": "pdf"
                }
            })
    except Exception as e:
        # Avoid silencing error completely, log or raise it
        print(f"Error loading PDF {file_path}: {e}")
        
    return documents


def load_txt(file_path: str) -> List[Dict[str, Any]]:
    """Loads a plain text file.
    
    Args:
        file_path: Path to the text file.
        
    Returns:
        A list containing a single dictionary with the file content and metadata.
    """
    text = read_text_file(file_path)
    stripped_text = text.strip()
    
    if not stripped_text:
        return []
        
    file_name = os.path.basename(file_path)
    return [{
        "text": stripped_text,
        "metadata": {
            "source": file_name,
            "type": "txt"
        }
    }]


def load_markdown(file_path: str) -> List[Dict[str, Any]]:
    """Loads a Markdown file.
    
    Args:
        file_path: Path to the markdown file.
        
    Returns:
        A list containing a single dictionary with markdown content and metadata.
    """
    text = read_text_file(file_path)
    stripped_text = text.strip()
    
    if not stripped_text:
        return []
        
    file_name = os.path.basename(file_path)
    return [{
        "text": stripped_text,
        "metadata": {
            "source": file_name,
            "type": "md"
        }
    }]


def load_document(file_path: str) -> List[Dict[str, Any]]:
    """Determines file type and loads the document contents.
    
    Args:
        file_path: Path to the file.
        
    Returns:
        List of dictionaries with extracted text and metadata.
    """
    _, ext = os.path.splitext(file_path.lower())
    
    if ext == ".pdf":
        return load_pdf(file_path)
    if ext in (".txt", ".text"):
        return load_txt(file_path)
    if ext in (".md", ".markdown"):
        return load_markdown(file_path)
        
    return []
