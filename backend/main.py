import os
import logging
import uvicorn
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.models import EmailInput, TicketUpdate
from backend import rag_engine, supabase_client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "Frontend Dev", "dist")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Pre-loading HuggingFace embeddings & FAISS index…")
    try:
        rag_engine.get_vectorstore()
        logger.info("RAG engine ready.")
    except Exception as e:
        logger.error("Failed to initialise RAG engine: %s", e)
    yield


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CS Support Operations System",
    description="LangChain RAG-powered customer support ticket system",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── API Routes ───────────────────────────────────────────────────────────────

async def send_reply_email(sender_email: str, sender_subject: str, reply_text: str) -> tuple[bool, str | None]:
    webhook_url = os.getenv("APPS_SCRIPT_WEBHOOK_URL")
    if not webhook_url:
        logger.warning("APPS_SCRIPT_WEBHOOK_URL is not configured in .env")
        return False, "APPS_SCRIPT_WEBHOOK_URL is not configured in .env"
    
    payload = {
        "sender_email": sender_email,
        "sender_subject": sender_subject,
        "human_agent_reply": reply_text,
        "ai_reply": reply_text
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json=payload, timeout=10)
            if resp.status_code in (200, 201, 302):
                return True, None
            else:
                error_msg = f"Webhook returned HTTP {resp.status_code}. Re-deploy the Apps Script with 'Anyone' access."
                logger.error(error_msg)
                return False, error_msg
    except Exception as e:
        logger.error(f"Failed to call Apps Script webhook: {e}")
        return False, str(e)
    return False, "Unknown error in send_reply_email"



@app.post("/api/tickets", summary="Process an incoming customer email into a support ticket")
async def create_ticket(email_input: EmailInput):
    """
    Accepts a raw customer email, runs the LangChain RAG pipeline,
    stores the result in Supabase, and returns the ticket JSON.
    """
    try:
        result = rag_engine.process_email(
            email_input.sender_email,
            email_input.sender_subject,
            email_input.sender_body_email,
        )
    except Exception as e:
        logger.exception("RAG pipeline error")
        raise HTTPException(status_code=500, detail=f"RAG pipeline error: {e}")

    # If it's a Human Agent, do not send an auto-reply back to the customer
    if result["agent_type"] == "Human Agent":
        result["ai_reply"] = ""

    ticket_data = {
        "sender_email": email_input.sender_email,
        "sender_subject": email_input.sender_subject,
        "sender_body_email": email_input.sender_body_email,
        "intent": result["intent"],
        "sentiment": result["sentiment"],
        "agent_type": result["agent_type"],
        "status": result["status"],
        "ai_reply": result["ai_reply"],
    }

    try:
        stored = supabase_client.insert_ticket(ticket_data)
    except Exception as e:
        logger.exception("Supabase insert error")
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    # Step: Check if critical and send Slack alert
    full_email_text = f"{email_input.sender_subject} {email_input.sender_body_email}"
    if rag_engine.is_critical_technical(result["intent"], full_email_text):
        slack_url = os.getenv("SLACK_WEBHOOK_URL")
        if slack_url:
            try:
                # Truncate body if it's too long
                snippet = email_input.sender_body_email.strip()
                if len(snippet) > 300:
                    snippet = snippet[:300] + "..."
                
                slack_payload = {
                    "text": f"🚨 *URGENT TECHNICAL ISSUE* 🚨\n*Customer Email:* `{email_input.sender_email}`\n*Ticket ID:* `{stored.get('id', 'N/A')}`\n*Subject:* {email_input.sender_subject}\n*Message Snippet:*\n```{snippet}```"
                }
                # Quick synchronous POST without blocking the whole process for too long
                httpx.post(slack_url, json=slack_payload, timeout=4.0)
                logger.info(f"Critical technical alert sent to Slack for ticket {stored.get('id')}")
            except Exception as e:
                logger.error(f"Failed to send Slack alert: {e}")
        else:
            logger.warning("Critical technical ticket detected, but SLACK_WEBHOOK_URL is not set in .env")

    # Step: Send AI auto-reply if applicable
    email_sent = False
    email_error = None
    if result["agent_type"] == "AI Agent" and result.get("ai_reply"):
        email_sent, email_error = await send_reply_email(
            email_input.sender_email,
            email_input.sender_subject,
            result["ai_reply"]
        )

    # Return the canonical JSON format requested by the user
    return {
        "sender_Email": stored.get("sender_email", ticket_data["sender_email"]),
        "Sender Subject": stored.get("sender_subject", ticket_data["sender_subject"]),
        "sender_body_email": stored.get("sender_body_email", ticket_data["sender_body_email"]),
        "Intent": stored.get("intent", ticket_data["intent"]),
        "Sentiment": stored.get("sentiment", ticket_data["sentiment"]),
        "Human Agent / AI Agent": stored.get("agent_type", ticket_data["agent_type"]),
        "Status (Resolved / Not Resolved)": stored.get("status", ticket_data["status"]),
        "ai_reply": result["ai_reply"],
        "human_agent_reply": stored.get("human_agent_reply"),
        "id": stored.get("id"),
        "created_at": stored.get("created_at"),
        "email_sent": email_sent,
        "email_error": email_error,
    }


@app.get("/api/tickets", summary="List all support tickets")
async def list_tickets():
    try:
        return supabase_client.get_all_tickets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tickets/{ticket_id}", summary="Get a single ticket by ID")
async def get_ticket(ticket_id: str):
    try:
        ticket = supabase_client.get_ticket_by_id(ticket_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@app.put("/api/tickets/{ticket_id}", summary="Update a ticket")
async def update_ticket(ticket_id: str, ticket_update: TicketUpdate):
    try:
        data_to_update = ticket_update.model_dump(exclude_unset=True)
        if not data_to_update:
            return supabase_client.get_ticket_by_id(ticket_id)
        
        updated_ticket = supabase_client.update_ticket(ticket_id, data_to_update)

        # Trigger Google Apps Script Webhook to send email for human replies
        email_sent = False
        email_error = None
        if data_to_update.get("human_agent_reply"):
            email_sent, email_error = await send_reply_email(
                updated_ticket.get("sender_email", ""),
                updated_ticket.get("sender_subject", ""),
                data_to_update["human_agent_reply"]
            )

        from typing import Any
        result: dict[str, Any] = dict(updated_ticket)
        result["email_sent"] = email_sent
        if email_error:
            result["email_error"] = email_error
        return result
    except Exception as e:
        logger.exception("Supabase update error")
        raise HTTPException(status_code=500, detail=f"Database update error: {e}")


@app.get("/health")
async def health():
    return {"status": "ok"}


# ─── Serve Frontend ───────────────────────────────────────────────────────────
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


# ─── Entry Point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
