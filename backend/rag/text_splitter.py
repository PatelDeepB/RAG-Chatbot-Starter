"""Text splitting utility for breaking large documents into smaller overlapping chunks.
"""

from typing import List, Dict, Any


def split_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """Splits a single string into overlapping chunks.
    
    Upgrades text splitting to use semantic hierarchy:
    1. First tries to split on paragraph boundaries (\n\n or \n).
    2. Fall back to sentence boundaries (. , ? , ! ).
    3. Fall back to standard space-based character windows if necessary.
    
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
    raw_blocks = []
    
    # 1. Break text into semantically safe blocks (all guaranteed <= chunk_size)
    paragraphs = stripped_text.split("\n\n")
    for para in paragraphs:
        if not para.strip():
            continue
            
        if len(para) <= chunk_size:
            raw_blocks.append(para.strip())
        else:
            # Paragraph is too large; split by single newlines
            lines = para.split("\n")
            for line in lines:
                if not line.strip():
                    continue
                    
                if len(line) <= chunk_size:
                    raw_blocks.append(line.strip())
                else:
                    # Line is still too large; split by sentence boundaries using regex
                    import re
                    sentences = re.split(r'(?<=[.!?])\s+', line)
                    for sent in sentences:
                        if not sent.strip():
                            continue
                            
                        if len(sent) <= chunk_size:
                            raw_blocks.append(sent.strip())
                        else:
                            # Sentence is STILL too large; fall back to word-level splits
                            words = sent.split(" ")
                            current_word_chunk = []
                            current_len = 0
                            for word in words:
                                if current_len + len(word) + 1 <= chunk_size:
                                    current_word_chunk.append(word)
                                    current_len += len(word) + 1
                                else:
                                    if current_word_chunk:
                                        raw_blocks.append(" ".join(current_word_chunk))
                                    current_word_chunk = [word]
                                    current_len = len(word)
                            if current_word_chunk:
                                raw_blocks.append(" ".join(current_word_chunk))
                                
    # 2. Assemble these semantic blocks into final overlapping chunks of size <= chunk_size
    current_chunk = []
    current_length = 0
    
    for block in raw_blocks:
        block_len = len(block)
        
        # If adding this block would exceed the maximum chunk size limit
        if current_length + block_len + (2 if current_chunk else 0) > chunk_size:
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
                
            # Create standard sliding overlaps by looking back at the end of the previous chunk
            overlap_blocks = []
            overlap_len = 0
            for prev_block in reversed(current_chunk):
                if overlap_len + len(prev_block) + 2 <= chunk_overlap:
                    overlap_blocks.insert(0, prev_block)
                    overlap_len += len(prev_block) + 2
                else:
                    break
                    
            current_chunk = overlap_blocks + [block]
            current_length = sum(len(b) for b in current_chunk) + 2 * (len(current_chunk) - 1)
        else:
            current_chunk.append(block)
            current_length += block_len + (2 if len(current_chunk) > 1 else 0)
            
    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
        
    return [c for c in chunks if c.strip()]


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
