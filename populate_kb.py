import logging
from backend import rag_engine
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)

if __name__ == "__main__":
    print("Populating Supabase pgvector from local KB docs...")
    embeddings = rag_engine.get_embeddings()
    rag_engine.build_vectorstore(embeddings)
    print("✅ Success! Your Knowledge Base Vectors have been pushed to Supabase.")
