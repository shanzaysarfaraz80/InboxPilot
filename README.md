# CS Support Operations System

AI-powered customer support ticket system using **LangChain RAG**, **HuggingFace Embeddings**, **OpenRouter LLM**, and **Supabase**.

## Stack
| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| LLM (chat) | OpenRouter → `meta-llama/llama-3.3-70b-instruct` |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` (local, no API key) |
| Vector Store | FAISS |
| Framework | LangChain |
| Database | Supabase (PostgreSQL) |
| Frontend | HTML / CSS / JS (dark glassmorphism) |

---

## Step 1 — Create Supabase Table

Run this SQL in your **Supabase → SQL Editor**:

```sql
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_email TEXT NOT NULL,
  sender_subject TEXT,
  sender_body_email TEXT,
  intent TEXT,
  sentiment TEXT,
  agent_type TEXT,
  status TEXT,
  ai_reply TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 2 — Install Dependencies

```bash
cd cs-support-system
pip install -r requirements.txt
```

> First run downloads the HuggingFace model (~90 MB) and builds the FAISS index.

---

## Step 3 — Run the Server

```bash
uvicorn backend.main:app --reload --port 8000
```

Open your browser at **http://localhost:8000**

---

## Routing Rules

| Condition | Agent |
|---|---|
| Intent = Security Issues | Human Agent |
| Email mentions "transaction/payment failed" | Human Agent |
| Sentiment = Angry | Human Agent |
| Everything else | AI Agent → Resolved |

---

## Output JSON Format

```json
{
  "sender_Email": "",
  "Sender Subject": "",
  "sender_body_email": "",
  "Intent": "",
  "Sentiment": "",
  "Human Agent / AI Agent": "",
  "Status (Resolved / Not Resolved)": "",
  "ai_reply": ""
}
```

---

## API Endpoints

| Method | URL | Description |
|---|---|---|
| POST | `/api/tickets` | Process email → create ticket |
| GET | `/api/tickets` | List all tickets |
| GET | `/api/tickets/{id}` | Get ticket by ID |
| GET | `/health` | Health check |
