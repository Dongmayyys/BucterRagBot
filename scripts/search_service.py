import os
import requests
import json
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from supabase import create_client

load_dotenv()

class SearchService:
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_KEY")
        self.siliconflow_api_key = os.getenv("SILICONFLOW_API_KEY")
        
        if not self.supabase_url or not self.supabase_key or not self.siliconflow_api_key:
            raise ValueError("Missing environment variables.")

        self.supabase = create_client(self.supabase_url, self.supabase_key)
        self.embeddings = OpenAIEmbeddings(
            base_url="https://api.siliconflow.cn/v1",
            api_key=self.siliconflow_api_key,
            model="BAAI/bge-m3",
            check_embedding_ctx_length=False
        )
        self.rerank_model = "BAAI/bge-reranker-v2-m3"

    def vector_search(self, query: str, top_k: int = 20, threshold: float = 0.3, filter_metadata: dict = None):
        """
        Perform vector search on Supabase.
        Returns a list of dicts: {'id', 'content', 'metadata', 'similarity'}
        """
        query_vector = self.embeddings.embed_query(query)
        
        filter_condition = filter_metadata if filter_metadata else {}

        response = self.supabase.rpc(
            "match_documents",
            {
                "query_embedding": query_vector,
                "match_threshold": threshold, 
                "match_count": top_k,
                "filter": filter_condition
            }
        ).execute()
        
        return response.data

    def rerank(self, query: str, documents: list, top_k: int = 5):
        """
        Rerank a list of documents using SiliconFlow API.
        documents: list of dicts from vector_search.
        """
        if not documents:
            return []

        # Construct payload for Rerank API
        # SiliconFlow (and TEI) expects: {"query": "...", "documents": ["doc1", "doc2", ...], "model": "..."}
        doc_texts = [doc.get('content', '') for doc in documents]
        
        url = "https://api.siliconflow.cn/v1/rerank"
        headers = {
            "Authorization": f"Bearer {self.siliconflow_api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.rerank_model,
            "query": query,
            "documents": doc_texts,
            "top_n": top_k,
            "return_documents": False # We just want indices and scores usually, but let's check response
        }

        try:
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()
            results = response.json().get("results", [])
            
            # Reconstruct the list based on rerank indices
            reranked_docs = []
            for item in results:
                # item is likely {'index': 0, 'relevance_score': 0.9}
                idx = item.get("index")
                score = item.get("relevance_score")
                
                original_doc = documents[idx]
                # Inject rerank score
                original_doc['rerank_score'] = score
                reranked_docs.append(original_doc)
                
            return reranked_docs

        except Exception as e:
            print(f"Rerank API failed: {e}")
            # Fallback to vector search results (sliced)
            print("Falling back to vector search results.")
            return documents[:top_k]

    def search(self, query: str, use_rerank: bool = True, filter_metadata: dict = None):
        # 1. Vector Search (High recall: get top 20-50)
        initial_results = self.vector_search(query, top_k=50, filter_metadata=filter_metadata)
        
        if not initial_results:
            return []

        # 2. Rerank (High precision: get top 5)
        if use_rerank:
            final_results = self.rerank(query, initial_results, top_k=5)
        else:
            final_results = initial_results[:5]
            
        return final_results

if __name__ == "__main__":
    # Quick test stub
    service = SearchService()
    import sys
    q = sys.argv[1] if len(sys.argv) > 1 else "test"
    print(f"Query: {q}")
    results = service.search(q)
    for i, r in enumerate(results):
        print(f"[{i+1}] Score: {r.get('rerank_score', r.get('similarity')):.4f} | {r.get('content')[:50]}...")
