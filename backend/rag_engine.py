import os
import json
import json_repair
import logging
from dotenv import load_dotenv
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(BASE_DIR, "kb")
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")
COLLECTION_NAME = "cs_support_kb"

# Lazy-loaded singletons
_vectorstore = None
_embeddings = None


# ─────────────────────────────────────────────
# Embeddings  (HuggingFace, fully local)
# ─────────────────────────────────────────────

def get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        logger.info("Loading HuggingFace embedding model (all-MiniLM-L6-v2)…")
        _embeddings = HuggingFaceEmbeddings(
            model_name="all-MiniLM-L6-v2",
            model_kwargs={"device": "cpu"},
        )
    return _embeddings


# ─────────────────────────────────────────────
# Chroma Vector Store
# ─────────────────────────────────────────────

def build_vectorstore(embeddings: HuggingFaceEmbeddings) -> Chroma:
    """Load KB docs, chunk them, embed and save a Chroma collection."""
    logger.info("Building Chroma vector store from KB documents…")
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

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        collection_name=COLLECTION_NAME,
        persist_directory=CHROMA_DIR,
    )
    logger.info("Chroma index saved to %s", CHROMA_DIR)
    return vectorstore


def get_vectorstore() -> Chroma:
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore

    embeddings = get_embeddings()

    # If the persisted DB exists and has documents, load it directly
    if os.path.isdir(CHROMA_DIR) and os.listdir(CHROMA_DIR):
        logger.info("Loading existing Chroma index from %s", CHROMA_DIR)
        _vectorstore = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=embeddings,
            persist_directory=CHROMA_DIR,
        )
    else:
        _vectorstore = build_vectorstore(embeddings)

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
   - "Account Issues"
   - "Billing Issues"
   - "Technical Issues"
   - "Security Issues"
   - "General Support"
3. "sentiment" MUST be exactly one of:
   - "Angry"
   - "Neutral"
   - "Happy"
4. "ai_reply" should be a helpful, empathetic reply grounded in the knowledge base context provided.

Required JSON format:
{
  "intent": "<one of the 5 categories>",
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

TRANSACTION_KEYWORDS = [
    "transaction failed",
    "payment failed",
    "payment declined",
    "charge failed",
    "transaction declined",
    "payment unsuccessful",
    "could not process payment",
    "couldn't process payment",
    "failed to process",
]

CRITICAL_TECHNICAL_KEYWORDS = [
    "page not loading",
    "app crashes",
    "crash",
    "down",
    "not loading",
    "fatal",
    "emergency",
]

def is_critical_technical(intent: str, full_text: str) -> bool:
    """Check if the ticket is a critical technical issue requiring immediate Slack attention."""
    if intent != "Technical Issues":
        return False
    text_lower = full_text.lower()
    return any(kw in text_lower for kw in CRITICAL_TECHNICAL_KEYWORDS)


def determine_routing(intent: str, sentiment: str, full_text: str) -> tuple[str, str]:
    """Return (agent_type, status) based on routing rules."""
    text_lower = full_text.lower()
    is_transaction = any(kw in text_lower for kw in TRANSACTION_KEYWORDS)
    is_security = intent == "Security Issues"
    is_angry = sentiment == "Angry"

    if is_transaction or is_security or is_angry:
        return "Human Agent", "Not Resolved"
    return "AI Agent", "Resolved"


# ─────────────────────────────────────────────
# Main Pipeline
# ─────────────────────────────────────────────

def process_email(sender_email: str, sender_subject: str, sender_body: str) -> dict:
    """
    Full RAG pipeline:
    1. Retrieve relevant KB chunks via FAISS
    2. Call OpenRouter LLM with KB context + email
    3. Parse JSON response
    4. Apply routing rules
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
    full_text = f"{sender_subject} {sender_body}"
    
    # Override sentiment for payment-related issues that aren't inherently angry
    text_lower = full_text.lower()
    is_transaction = any(kw in text_lower for kw in TRANSACTION_KEYWORDS)
    if is_transaction and result["sentiment"] != "Angry":
        result["sentiment"] = "Neutral"

    agent_type, status = determine_routing(result["intent"], result["sentiment"], full_text)

    return {
        "intent": result["intent"],
        "sentiment": result["sentiment"],
        "ai_reply": result["ai_reply"],
        "agent_type": agent_type,
        "status": status,
    }
