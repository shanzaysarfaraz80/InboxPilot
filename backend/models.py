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


class OrderInput(BaseModel):
    name: str
    email: str
    product: str
    order_date: str
    delivery_due_date: str
    delivery_status: Optional[str] = "Pending"


class OrderUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    product: Optional[str] = None
    order_date: Optional[str] = None
    delivery_due_date: Optional[str] = None
    delivery_status: Optional[str] = None
