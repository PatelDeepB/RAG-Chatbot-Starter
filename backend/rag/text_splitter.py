"""Text splitting utility for breaking large documents into smaller overlapping chunks.
"""

from typing import List, Dict, Any


def split_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """Splits a single string into overlapping chunks.
    
    Attempts to avoid breaking words or sentences by looking back for white spaces.
    
    Args:
        text: The raw input text.
        chunk_size: Maximum character count per chunk.
        chunk_overlap: Number of overlapping characters between adjacent chunks.
        
    Returns:
        List of text chunks.
    """
    stripped_text = text.strip()
    if len(stripped_text) <= chunk_size:
        return [stripped_text]
        
    chunks = []
    start = 0
    text_length = len(stripped_text)
    
    while start < text_length:
        end = start + chunk_size
        if end >= text_length:
            chunks.append(stripped_text[start:])
            break
            
        # Search for a natural break point (newline, tab, or space) in the last 15% of the chunk
        lookback_limit = max(start, end - int(chunk_size * 0.15))
        boundary = -1
        
        for i in range(end, lookback_limit, -1):
            if stripped_text[i] in ("\n", " ", "\t"):
                boundary = i
                break
                
        if boundary != -1:
            chunks.append(stripped_text[start:boundary].strip())
            start = boundary + 1 - chunk_overlap
        else:
            chunks.append(stripped_text[start:end].strip())
            start = end - chunk_overlap
            
        # Safeguard to prevent infinite loops (e.g. if overlap is set too high)
        if start >= end:
            start = end
            
    return [c for c in chunks if c]


def split_documents(
    documents: List[Dict[str, Any]], 
    chunk_size: int = 1000, 
    chunk_overlap: int = 200
) -> List[Dict[str, Any]]:
    """Splits a list of loaded documents into smaller overlapping chunks.
    
    Keeps metadata intact, appending chunk sequence details.
    
    Args:
        documents: List of loaded document dicts with keys 'text' and 'metadata'.
        chunk_size: Maximum character size of each chunk.
        chunk_overlap: Number of overlapping characters between chunks.
        
    Returns:
        A list of split chunk dicts with updated metadata.
    """
    split_docs = []
    
    for doc in documents:
        text = doc["text"]
        metadata = doc["metadata"]
        
        chunks = split_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        
        for i, chunk in enumerate(chunks):
            chunk_metadata = metadata.copy()
            chunk_metadata["chunk_index"] = i
            
            split_docs.append({
                "text": chunk,
                "metadata": chunk_metadata
            })
            
    return split_docs
