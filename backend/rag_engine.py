import os
import json
import json_repair
import logging
from dotenv import load_dotenv
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from supabase.client import Client, create_client
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from backend import supabase_client

load_dotenv()

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(BASE_DIR, "kb")
# Lazy-loaded singletons
_vectorstore = None
_embeddings = None
_supabase_client = None

def get_supabase_client() -> Client:
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        _supabase_client = create_client(url, key)
    return _supabase_client


# ─────────────────────────────────────────────
# Embeddings  (FastEmbed — ONNX runtime, no torch)
#
# Same model/dimension (384) as the original sentence-transformers setup,
# but ONNX-based so it doesn't pull in torch. torch alone pushed the Vercel
# Python function bundle to 5.5GB, far over the 500MB serverless limit.
# ─────────────────────────────────────────────

def get_embeddings() -> FastEmbedEmbeddings:
    global _embeddings
    if _embeddings is None:
        logger.info("Loading FastEmbed (ONNX) embeddings…")
        _embeddings = FastEmbedEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            # Vercel's Python functions have a read-only filesystem except /tmp;
            # fastembed's default cache dir isn't writable there.
            cache_dir="/tmp/fastembed_cache",
        )
    return _embeddings


# ─────────────────────────────────────────────
# Supabase Vector Store
# ─────────────────────────────────────────────

def build_vectorstore(embeddings: FastEmbedEmbeddings) -> SupabaseVectorStore:
    """Load KB docs, chunk them, embed and save them to Supabase pgvector."""
    logger.info("Uploading KB documents to Supabase pgvector…")
    loader = DirectoryLoader(
        KB_DIR,
        glob="*.txt",
        loader_cls=TextLoader,
        loader_kwargs={"encoding": "utf-8"},
    )
    docs = loader.load()
    if not docs:
        raise RuntimeError(f"No .txt files found in KB directory: {KB_DIR}")

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(docs)
    logger.info("Split %d documents into %d chunks.", len(docs), len(chunks))

    client = get_supabase_client()
    vectorstore = SupabaseVectorStore.from_documents(
        chunks,
        embeddings,
        client=client,
        table_name="kb_documents",
        query_name="match_kb_documents"
    )
    logger.info("Successfully saved vectors to Supabase.")
    return vectorstore


def _delete_vectors_for_source(filename: str) -> None:
    """Remove any previously embedded chunks whose metadata.source matches this KB file."""
    client = get_supabase_client()
    source_path = os.path.join(KB_DIR, filename)
    client.table("kb_documents").delete().eq("metadata->>source", source_path).execute()


def embed_kb_document(filename: str) -> int:
    """
    Embed a single KB file into Supabase pgvector and make it available to the
    live vectorstore immediately — no full rebuild of the other KB files.
    Replaces any vectors from a previous upload of the same filename first,
    so re-uploading a file doesn't create duplicate chunks.
    """
    file_path = os.path.join(KB_DIR, filename)
    loader = TextLoader(file_path, encoding="utf-8")
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(docs)

    _delete_vectors_for_source(filename)

    vectorstore = get_vectorstore()
    vectorstore.add_documents(chunks)
    logger.info("Embedded %d chunks for '%s' into Supabase.", len(chunks), filename)
    return len(chunks)


def delete_kb_document_vectors(filename: str) -> None:
    """Remove a KB file's embedded chunks from Supabase so the agent stops using it."""
    _delete_vectors_for_source(filename)


def get_vectorstore() -> SupabaseVectorStore:
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore

    embeddings = get_embeddings()
    client = get_supabase_client()

    # Always instantiate the vectorstore pointing to the remote Supabase database
    # For initial populating of Supabase, you must run build_vectorstore manually or call an admin endpoint
    # Vercel serverless environment should not build the store, only read it
    _vectorstore = SupabaseVectorStore(
        client=client,
        embedding=embeddings,
        table_name="kb_documents",
        query_name="match_kb_documents"
    )

    return _vectorstore


# ─────────────────────────────────────────────
# LLM  (OpenRouter via LangChain ChatOpenAI)
# ─────────────────────────────────────────────

def get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct"),
        openai_api_key=os.getenv("OPENROUTER_API_KEY"),
        openai_api_base="https://openrouter.ai/api/v1",
        temperature=0.2,
        max_tokens=1024,
    )


# ─────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are a professional Customer Support AI Agent.
Your job is to analyze incoming customer support emails and respond with a structured JSON object.

STRICT RULES:
1. Respond with ONLY a valid JSON object — no markdown fences, no prose, no extra keys.
2. "intent" MUST be exactly one of:
   - "Return"
   - "Refund"
   - "Payment Failed"
   - "Queries"
   - "Delivery"
   - "General FAQs"
   - "Complaints"
3. "sentiment" MUST be exactly one of:
   - "Angry"
   - "Neutral"
   - "Happy"
4. "ai_reply" should be a helpful, empathetic reply grounded in the knowledge base context provided. If the intent is "Delivery", a generic placeholder reply is fine — it will be replaced with the customer's real order status.

Required JSON format:
{
  "intent": "<one of the 7 categories>",
  "sentiment": "<Angry | Neutral | Happy>",
  "ai_reply": "<your helpful reply to the customer>"
}"""

USER_TEMPLATE = """Knowledge Base Context (use this to craft your reply):
{context}

---

Customer Email:
From: {sender_email}
Subject: {sender_subject}
Body:
{sender_body}

Analyze the email. Return ONLY the JSON object."""


# ─────────────────────────────────────────────
# Routing Logic
# ─────────────────────────────────────────────

# Intents that always escalate to a Human Agent, regardless of sentiment.
ESCALATE_INTENTS = {"Return", "Payment Failed", "Complaints"}


def determine_routing(intent: str, sentiment: str) -> tuple[str, str]:
    """Return (agent_type, status) based on routing rules."""
    if intent in ESCALATE_INTENTS or sentiment == "Angry":
        return "Human Agent", "Not Resolved"
    return "AI Agent", "Resolved"


def process_delivery_intent(sender_email: str, sender_subject: str, sender_body: str) -> dict:
    """Look up the customer's order by email and build a delivery-status reply."""
    order = supabase_client.get_order_by_email(sender_email)
    if order:
        reply = (
            f"Hi, thanks for reaching out about your order for **{order['product']}**.\n\n"
            f"- Order date: {order['order_date']}\n"
            f"- Expected delivery: {order['delivery_due_date']}\n"
            f"- Current status: **{order['delivery_status']}**\n\n"
            "If anything looks off, just reply to this email and we'll take a closer look."
        )
    else:
        reply = (
            "Thanks for reaching out about your delivery! We couldn't find an order linked "
            "to this email address — could you reply with your order ID so we can look into it "
            "right away?"
        )
    return {
        "intent": "Delivery",
        "sentiment": "Neutral",
        "ai_reply": reply,
        "agent_type": "AI Agent",
        "status": "Resolved",
    }


# ─────────────────────────────────────────────
# Main Pipeline
# ─────────────────────────────────────────────

def process_email(sender_email: str, sender_subject: str, sender_body: str) -> dict:
    """
    Full RAG pipeline:
    1. Retrieve relevant KB chunks from Supabase pgvector
    2. Call OpenRouter LLM with KB context + email to classify intent/sentiment
    3. Parse JSON response
    4. Apply routing rules (Delivery gets a real order lookup instead of a KB reply)
    5. Return enriched ticket dict
    """
    # Step 1 – retrieve relevant KB context
    vectorstore = get_vectorstore()
    query = f"{sender_subject} {sender_body}"
    relevant_docs = vectorstore.similarity_search(query, k=4)
    context = "\n\n---\n\n".join(doc.page_content for doc in relevant_docs)

    # Step 2 – call LLM
    llm = get_llm()
    user_message = USER_TEMPLATE.format(
        context=context,
        sender_email=sender_email,
        sender_subject=sender_subject,
        sender_body=sender_body,
    )
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]
    response = llm.invoke(messages)
    raw = response.content.strip()

    # Step 3 – parse JSON (strip markdown fences if LLM wraps anyway)
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    try:
        result = json_repair.loads(raw)
    except Exception as e:
        logger.error(f"Failed to parse LLM JSON output: {raw}")
        raise ValueError(f"LLM output could not be parsed as JSON: {e}")

    # Validate
    for field in ("intent", "sentiment", "ai_reply"):
        if field not in result:
            raise ValueError(f"LLM response missing required field: '{field}'")

    # Step 4 – routing
    intent = result["intent"]
    sentiment = result["sentiment"]
    agent_type, status = determine_routing(intent, sentiment)

    # Delivery tickets that aren't escalated get a real order lookup instead of a KB reply
    if intent == "Delivery" and agent_type == "AI Agent":
        return process_delivery_intent(sender_email, sender_subject, sender_body)

    return {
        "intent": intent,
        "sentiment": sentiment,
        "ai_reply": result["ai_reply"],
        "agent_type": agent_type,
        "status": status,
    }
