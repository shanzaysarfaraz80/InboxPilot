from pydantic import BaseModel
from typing import Optional


class EmailInput(BaseModel):
    sender_email: str
    sender_subject: str
    sender_body_email: str


class TicketOutput(BaseModel):
    sender_email: str
    sender_subject: str
    sender_body_email: str
    intent: str
    sentiment: str
    agent_type: str
    status: str
    ai_reply: str
    human_agent_reply: Optional[str] = None
    id: Optional[str] = None
    created_at: Optional[str] = None


class TicketUpdate(BaseModel):
    human_agent_reply: Optional[str] = None
    status: Optional[str] = None
