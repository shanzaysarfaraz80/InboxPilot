import os
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def get_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    return create_client(url, key)


def insert_ticket(data: dict) -> dict:
    client = get_client()

    # Always insert into the main tickets table
    response = client.table("tickets").insert(data).execute()
    
    # If routed to Human Agent, keep a copy in the dedicated human_tickets table
    if data.get("agent_type") == "Human Agent":
        try:
            # Create a copy so we don't modify the original 'data' dict which gets returned
            human_data = dict(data)
            
            # Map ai_reply to human_reply for this specific table
            if "ai_reply" in human_data:
                human_data["human_reply"] = human_data.pop("ai_reply")
                
            client.table("human_tickets").insert(human_data).execute()
        except Exception as e:
            logger.error("Failed to insert into human_tickets: %s", e)

    if response.data:
        return response.data[0]
    
    logger.error("Supabase insert returned no data: %s", response)
    return data

def get_all_tickets() -> list:
    client = get_client()
    response = (
        client.table("tickets")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def get_ticket_by_id(ticket_id: str) -> dict:
    client = get_client()
    response = client.table("tickets").select("*").eq("id", ticket_id).execute()
    if response.data:
        return response.data[0]
    return {}


def update_ticket(ticket_id: str, data: dict) -> dict:
    client = get_client()
    response = client.table("tickets").update(data).eq("id", ticket_id).execute()
    if response.data:
        return response.data[0]
    return {}
