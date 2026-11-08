import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  Send,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Code,
  CreditCard,
  Package,
  Sparkles,
  RefreshCcw,
  Bug,
  XCircle,
  ChevronRight,
  Copy,
  Terminal,
  LayoutDashboard,
  Inbox,
  BarChart3,
  Search,
  User,
  Users,
  Clock,
  ExternalLink,
  ArrowLeft,
  Loader2,
  BookOpen,
  Upload,
  FileText,
  Trash2,
  CheckCircle,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// --- Types ---

type Page = 'create-ticket' | 'tickets' | 'human-tickets' | 'analytics' | 'upload-kb' | 'order-tracking';

interface Ticket {
  id: string;
  sender_email: string;
  sender_subject: string;
  sender_body_email: string;
  intent: string;
  sentiment: string;
  agent_type: string;
  status: string;
  ai_reply: string;
  human_agent_reply: string;
  created_at: string;
}

interface Order {
  id: string;
  name: string;
  email: string;
  product: string;
  order_date: string;
  delivery_due_date: string;
  delivery_status: string;
  created_at: string;
}

// --- Normalization helpers ---
// The backend returns values like "AI Agent", "Human Agent", "Resolved", "Not Resolved",
// "Payment Failed", etc. We normalize them to the lowercase keys used in this UI.

function normalizeIntent(raw: string): string {
  return (raw || 'queries').toLowerCase();
}

function normalizeSentiment(raw: string): string {
  return raw.toLowerCase() === 'angry' ? 'angry' : 'neutral';
}

function normalizeAgentType(raw: string): string {
  return raw.toLowerCase().includes('human') ? 'human' : 'ai';
}

function normalizeStatus(raw: string): string {
  return raw.toLowerCase() === 'resolved' ? 'resolved' : 'open';
}

function normalizeTicket(raw: any): Ticket {
  return {
    id: raw.id ?? '',
    sender_email:     raw.sender_email     ?? raw.sender_Email ?? '',
    sender_subject:   raw.sender_subject   ?? raw['Sender Subject'] ?? '',
    sender_body_email: raw.sender_body_email ?? '',
    intent:     normalizeIntent(raw.intent     ?? raw.Intent     ?? ''),
    sentiment:  normalizeSentiment(raw.sentiment  ?? raw.Sentiment  ?? ''),
    agent_type: normalizeAgentType(raw.agent_type ?? raw['Human Agent / AI Agent'] ?? ''),
    status:     normalizeStatus(raw.status     ?? raw['Status (Resolved / Not Resolved)'] ?? ''),
    ai_reply:   raw.ai_reply ?? '',
    human_agent_reply: raw.human_agent_reply ?? '',
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

// --- API helpers ---

const API = {
  async getTickets(): Promise<Ticket[]> {
    const res = await fetch('/api/tickets');
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(normalizeTicket);
  },

  async createTicket(payload: {
    sender_email: string;
    sender_subject: string;
    sender_body_email: string;
  }): Promise<Ticket> {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? 'Server error');
    }
    return normalizeTicket(await res.json());
  },

  async updateTicket(id: string, updates: Partial<Ticket>): Promise<Ticket> {
    const payload: any = {};
    if (updates.human_agent_reply !== undefined) payload.human_agent_reply = updates.human_agent_reply;
    if (updates.status !== undefined) {
      // Backend expects "Resolved" or "Not Resolved"
      payload.status = updates.status === 'resolved' ? 'Resolved' : 'Not Resolved';
    }

    const res = await fetch(`/api/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? 'Server update error');
    }
    return normalizeTicket(await res.json());
  },

  async getOrders(): Promise<Order[]> {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async createOrder(payload: Omit<Order, 'id' | 'created_at'>): Promise<Order> {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? 'Server error');
    }
    return res.json();
  },

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? 'Server update error');
    }
    return res.json();
  },

  async deleteOrder(id: string): Promise<void> {
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail ?? 'Server delete error');
    }
  },
};

// --- Constants ---

const INTENT_ICONS: Record<string, React.ReactNode> = {
  return:           <XCircle className="w-4 h-4" />,
  refund:           <RefreshCcw className="w-4 h-4" />,
  'payment failed': <CreditCard className="w-4 h-4" />,
  queries:          <MessageSquare className="w-4 h-4" />,
  delivery:         <Package className="w-4 h-4" />,
  'general faqs':   <Sparkles className="w-4 h-4" />,
  complaints:       <AlertCircle className="w-4 h-4" />,
};

const SENTIMENT_COLORS: Record<string, string> = {
  angry:   'bg-red-500/10 text-red-500 border-red-500/20',
  neutral: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  Pending:   'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  Shipped:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Delayed:   'bg-red-500/10 text-red-400 border-red-500/20',
};

const SAMPLE_EMAILS = {
  angry: {
    label: '😡 Angry',
    email: 'angry.customer@example.com',
    subject: 'Transaction Failed AGAIN — Fix This NOW',
    body: "I am absolutely furious! My payment has failed for the third time this week. I was charged $99.99 but the transaction failed and the money still left my account. This is completely unacceptable. I demand an immediate refund and a proper explanation.",
  },
  complaint: {
    label: '😠 Complaint',
    email: 'victim@example.com',
    subject: 'Very disappointed with my recent purchase',
    body: "I want to file a complaint. The product I received does not match the description at all and customer service has been unhelpful so far. Please escalate this.",
  },
  general: {
    label: '❓ FAQ',
    email: 'curious@example.com',
    subject: 'What are your support hours?',
    body: "Hi, I just wanted to know what your customer support hours are and what payment methods you accept. Also, do you have a mobile app? Thanks!",
  },
  delivery: {
    label: '📦 Delivery',
    email: 'shopper@example.com',
    subject: 'Where is my order?',
    body: "Hi, I placed an order last week and haven't received it yet. Can you tell me the delivery status?",
  },
  return: {
    label: '↩️ Return',
    email: 'returns@example.com',
    subject: 'I want to return this product',
    body: "I received the wrong size and would like to return this item for a refund. Please advise on the return process.",
  },
};

// --- Sub-components ---

const SidebarItem = ({
  id, icon: Icon, label, active, onClick
}: {
  id: Page; icon: any; label: string; active: boolean; onClick: (id: Page) => void;
}) => (
  <button
    onClick={() => onClick(id)}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
      active
        ? 'bg-emerald-500 text-black font-semibold shadow-lg shadow-emerald-500/20'
        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
    }`}
  >
    <Icon className={`w-5 h-5 ${active ? 'text-black' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
    <span className="text-sm">{label}</span>
  </button>
);

// --- Pages ---

const ProcessorPage = ({
  onTicketProcessed
}: {
  onTicketProcessed: (ticket: Ticket) => void;
}) => {
  const [senderEmail,   setSenderEmail]   = useState('');
  const [senderSubject, setSenderSubject] = useState('');
  const [emailBody,     setEmailBody]     = useState('');
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [result,        setResult]        = useState<Ticket | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  const fillSample = (key: keyof typeof SAMPLE_EMAILS) => {
    const s = SAMPLE_EMAILS[key];
    setSenderEmail(s.email);
    setSenderSubject(s.subject);
    setEmailBody(s.body);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!senderEmail.trim() || !senderSubject.trim() || !emailBody.trim()) return;
    setIsProcessing(true);
    setError(null);
    setResult(null);
    try {
      const ticket = await API.createTicket({
        sender_email:      senderEmail.trim(),
        sender_subject:    senderSubject.trim(),
        sender_body_email: emailBody.trim(),
      });
      setResult(ticket);
      onTicketProcessed(ticket);
    } catch (err: any) {
      setError(err.message ?? 'Failed to process ticket. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyJson = () => {
    if (result) navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  };

  const canSubmit = senderEmail.trim() && senderSubject.trim() && emailBody.trim() && !isProcessing;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left: Form */}
      <div className="lg:col-span-7 space-y-4">
        {/* Sender + Subject row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center gap-2 text-xs font-medium text-zinc-400">
              <User className="w-3.5 h-3.5" /> Sender Email
            </div>
            <div className="px-4 py-3">
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full bg-transparent border-none focus:ring-0 text-zinc-200 placeholder:text-zinc-600 text-sm outline-none"
              />
            </div>
          </section>

          <section className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center gap-2 text-xs font-medium text-zinc-400">
              <Mail className="w-3.5 h-3.5" /> Subject
            </div>
            <div className="px-4 py-3">
              <input
                type="text"
                value={senderSubject}
                onChange={(e) => setSenderSubject(e.target.value)}
                placeholder="e.g. My payment failed!"
                className="w-full bg-transparent border-none focus:ring-0 text-zinc-200 placeholder:text-zinc-600 text-sm outline-none"
              />
            </div>
          </section>
        </div>

        {/* Email body */}
        <section className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Mail className="w-4 h-4" />
              Email Body
            </div>
          </div>
          <div className="p-6">
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Paste or type the customer's email body here..."
              className="w-full h-48 bg-transparent border-none focus:ring-0 text-zinc-200 placeholder:text-zinc-600 resize-none outline-none"
            />
          </div>
        </section>

        {/* Quick samples */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-zinc-600">Quick samples:</span>
          {(Object.keys(SAMPLE_EMAILS) as (keyof typeof SAMPLE_EMAILS)[]).map((key) => (
            <button
              key={key}
              onClick={() => fillSample(key)}
              className="px-3 py-1.5 text-xs bg-zinc-900 border border-white/5 rounded-full text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-all"
            >
              {SAMPLE_EMAILS[key].label}
            </button>
          ))}
        </div>

        <button
          onClick={handleProcess}
          disabled={!canSubmit}
          className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-semibold rounded-xl transition-all flex items-center justify-center gap-2 group"
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Process Ticket
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>

      {/* Right: Result */}
      <div className="lg:col-span-5 space-y-6">
        <AnimatePresence mode="wait">
          {!result && !isProcessing && !error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center text-center p-12 border border-dashed border-white/10 rounded-2xl bg-white/[0.02] min-h-64"
            >
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-zinc-600" />
              </div>
              <h3 className="text-zinc-400 font-medium mb-2">Ready to Process</h3>
              <p className="text-zinc-600 text-sm max-w-xs">
                Fill in the email details and click Process to run the RAG pipeline.
              </p>
            </motion.div>
          )}

          {isProcessing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-zinc-900/50 animate-pulse rounded-2xl border border-white/5" />
              ))}
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-4"
            >
              <AlertCircle className="text-red-500 w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-red-500 font-medium">Processing Error</h4>
                <p className="text-red-400/70 text-sm mt-1">{error}</p>
              </div>
            </motion.div>
          )}

          {result && !isProcessing && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-2xl">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Intent</div>
                  <div className="flex items-center gap-2 text-zinc-200 font-medium capitalize">
                    {INTENT_ICONS[result.intent] ?? <Sparkles className="w-4 h-4" />}
                    {result.intent}
                  </div>
                </div>
                <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-2xl">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Sentiment</div>
                  <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${SENTIMENT_COLORS[result.sentiment] ?? SENTIMENT_COLORS.neutral}`}>
                    {result.sentiment}
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-2xl border flex items-start gap-4 ${result.agent_type === 'ai' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-900/50 border-white/5'}`}>
                {result.agent_type === 'ai'
                  ? <CheckCircle2 className="text-emerald-500 w-6 h-6 shrink-0" />
                  : <AlertCircle className="text-zinc-500 w-6 h-6 shrink-0" />}
                <div>
                  <h4 className={`font-medium ${result.agent_type === 'ai' ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {result.agent_type === 'ai' ? 'Auto-Reply Sent' : 'Manual Review Required'}
                  </h4>
                  <p className="text-zinc-500 text-sm mt-1">
                    {result.agent_type === 'ai'
                      ? 'A professional response has been generated and stored.'
                      : 'Routed to a human agent for manual handling.'}
                  </p>
                </div>
              </div>

              {result.ai_reply && (
                <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2 text-sm font-medium text-zinc-400">
                    <Send className="w-4 h-4" />
                    Generated Reply
                  </div>
                  <div className="p-6 prose prose-invert prose-sm max-w-none">
                    <Markdown>{result.ai_reply}</Markdown>
                  </div>
                </div>
              )}

              <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-400 font-mono">
                    <Terminal className="w-4 h-4" />
                    TICKET_JSON
                  </div>
                  <button
                    onClick={copyJson}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-zinc-500 hover:text-zinc-200"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <pre className="p-6 overflow-x-auto text-[13px] font-mono text-emerald-400/80 leading-relaxed">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const TicketsPage = ({
  tickets,
  loading,
  onRefresh,
  title = 'All Tickets',
  subtitle = 'Manage and respond to tickets in the queue.'
}: {
  tickets: Ticket[];
  loading: boolean;
  onRefresh: () => void;
  title?: string;
  subtitle?: string;
}) => {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [search, setSearch] = useState('');
  const [editReply, setEditReply] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [saveDetailSuccess, setSaveDetailSuccess] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterIntent, setFilterIntent] = useState('');
  const [filterSentiment, setFilterSentiment] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const isEditable = title === 'Human Assigned Tickets';

  useEffect(() => {
    if (selectedTicket) {
      setEditReply(selectedTicket.human_agent_reply || '');
      setEditStatus(selectedTicket.status);
    }
  }, [selectedTicket]);

  const handleSave = async () => {
    if (!selectedTicket) return;
    setIsSaving(true);
    try {
      const result = await API.updateTicket(selectedTicket.id, {
        human_agent_reply: editReply,
        status: editStatus
      });
      onRefresh();
      setSelectedTicket(null);
      // Warn if the ticket saved but the email couldn't be sent
      if ((result as any).email_error) {
        alert(`✅ Reply saved, but email could NOT be sent:\n\n${(result as any).email_error}\n\nPlease re-deploy your Google Apps Script with "Anyone" access.`);
      }
    } catch (e) {
      alert("Failed to save ticket");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedTicket) return;
    setIsSavingDetails(true);
    setSaveDetailSuccess(false);
    try {
      // Pass only status — no human_agent_reply — so the webhook is NOT triggered
      await API.updateTicket(selectedTicket.id, {
        human_agent_reply: editReply,
        status: editStatus,
      });
      setSaveDetailSuccess(true);
      onRefresh();
      setTimeout(() => setSaveDetailSuccess(false), 2500);
    } catch (e) {
      alert('Failed to save details');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tickets.filter(t => {
      // Free text search
      const matchesSearch =
        t.sender_email.toLowerCase().includes(q) ||
        t.sender_subject.toLowerCase().includes(q) ||
        t.intent.toLowerCase().includes(q);

      // Column filters
      const matchesIntent = filterIntent ? t.intent === filterIntent : true;
      const matchesSentiment = filterSentiment ? t.sentiment === filterSentiment : true;
      const matchesAgent = filterAgent ? t.agent_type === filterAgent : true;
      const matchesStatus = filterStatus ? t.status === filterStatus : true;

      return matchesSearch && matchesIntent && matchesSentiment && matchesAgent && matchesStatus;
    });
  }, [tickets, search, filterIntent, filterSentiment, filterAgent, filterStatus]);

  if (selectedTicket) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedTicket(null)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tickets
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{selectedTicket.sender_subject}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-zinc-500">
              <span className="font-mono text-emerald-500">{selectedTicket.id.substring(0, 8)}</span>
              <span>•</span>
              <span>From: {selectedTicket.sender_email}</span>
              <span>•</span>
              <span>{new Date(selectedTicket.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2 text-sm font-medium text-zinc-400">
                <Mail className="w-4 h-4" />
                Customer Message
              </div>
              <div className="p-6 text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">
                {selectedTicket.sender_body_email}
              </div>
            </div>

            {isEditable ? (
              <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  <User className="w-4 h-4" />
                  Human Agent Reply
                </div>
                <div className="p-6">
                  <textarea
                    value={editReply}
                    onChange={(e) => setEditReply(e.target.value)}
                    placeholder="Type your reply to the customer here..."
                    className="w-full h-32 bg-transparent border-none focus:ring-0 text-zinc-200 placeholder:text-zinc-600 resize-none outline-none"
                  />
                </div>
              </div>
            ) : selectedTicket.human_agent_reply ? (
              <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  <User className="w-4 h-4" />
                  Human Agent Reply
                </div>
                <div className="p-6 text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">
                  {selectedTicket.human_agent_reply}
                </div>
              </div>
            ) : selectedTicket.ai_reply && (
              <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  <Send className="w-4 h-4" />
                  AI Generated Reply
                </div>
                <div className="p-6 prose prose-invert prose-sm max-w-none">
                  <Markdown>{selectedTicket.ai_reply}</Markdown>
                </div>
              </div>
            )}

            {/* Trail Conversation */}
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-white/5 flex items-center gap-2 text-sm font-medium text-zinc-400">
                <MessageSquare className="w-4 h-4" />
                Trail Conversation
              </div>
              <div className="p-6 space-y-4">

                {/* Customer message */}
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                    {selectedTicket.sender_email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-zinc-300">{selectedTicket.sender_email}</span>
                      <span className="text-[10px] text-zinc-600">{new Date(selectedTicket.created_at).toLocaleString()}</span>
                    </div>
                    <div className="bg-zinc-800/60 rounded-xl rounded-tl-sm px-4 py-3 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {selectedTicket.sender_body_email}
                    </div>
                  </div>
                </div>

                {/* AI reply */}
                {selectedTicket.ai_reply && (
                  <div className="flex gap-3 flex-row-reverse">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">
                      AI
                    </div>
                    <div className="flex-1 flex flex-col items-end">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-zinc-600">{new Date(selectedTicket.created_at).toLocaleString()}</span>
                        <span className="text-xs font-semibold text-emerald-400">AI Agent</span>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl rounded-tr-sm px-4 py-3 text-sm text-zinc-300 leading-relaxed max-w-[90%]">
                        <Markdown>{selectedTicket.ai_reply}</Markdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* Human agent reply */}
                {selectedTicket.human_agent_reply && (
                  <div className="flex gap-3 flex-row-reverse">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1 flex flex-col items-end">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-zinc-600">Human Agent</span>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl rounded-tr-sm px-4 py-3 text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed max-w-[90%]">
                        {selectedTicket.human_agent_reply}
                      </div>
                    </div>
                  </div>
                )}

                {!selectedTicket.ai_reply && !selectedTicket.human_agent_reply && (
                  <p className="text-xs text-zinc-600 italic text-center py-2">No replies yet.</p>
                )}
              </div>
            </div>

          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-6">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Intent</div>
                <div className="flex items-center gap-2 text-zinc-200 font-medium capitalize">
                  {INTENT_ICONS[selectedTicket.intent] ?? <Sparkles className="w-4 h-4" />}
                  {selectedTicket.intent}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Sentiment</div>
                <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${SENTIMENT_COLORS[selectedTicket.sentiment] ?? SENTIMENT_COLORS.neutral}`}>
                  {selectedTicket.sentiment}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Status</div>
                {isEditable ? (
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Closed (Resolved)</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    {selectedTicket.status === 'resolved'
                      ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-emerald-400">Resolved</span></>
                      : <><AlertCircle className="w-4 h-4 text-zinc-500" /><span className="text-zinc-400">Open</span></>}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2">Assigned Agent</div>
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <User className="w-4 h-4 text-zinc-500" />
                  {selectedTicket.agent_type === 'ai' ? 'AI Assistant' : 'Human Agent'}
                </div>
              </div>
            </div>

            {isEditable && (
              <div className="space-y-3">
                <button
                  onClick={handleSaveDetails}
                  disabled={isSavingDetails || isSaving}
                  className="w-full py-3 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-100 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isSavingDetails ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : saveDetailSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  )}
                  {isSavingDetails ? 'Saving...' : saveDetailSuccess ? 'Saved!' : 'Save Details'}
                </button>

                <button
                  onClick={handleSave}
                  disabled={isSaving || isSavingDetails}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isSaving ? 'Sending...' : 'Save & Send Email'}
                </button>
              </div>
            )}


          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-zinc-500 text-sm mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="pl-9 pr-4 py-2 bg-zinc-900 border border-white/5 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none w-56 text-zinc-200"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 border rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
              showFilters || filterIntent || filterSentiment || filterAgent || filterStatus
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-zinc-900 text-zinc-400 border-white/5 hover:text-zinc-100'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filters
            {(filterIntent || filterSentiment || filterAgent || filterStatus) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 ml-1"></span>
            )}
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 bg-zinc-900 border border-white/5 rounded-lg text-zinc-400 hover:text-zinc-100 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-2xl flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Intent</label>
                <select
                  value={filterIntent}
                  onChange={(e) => setFilterIntent(e.target.value)}
                  className="block w-40 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All Intents</option>
                  <option value="return">Return</option>
                  <option value="refund">Refund</option>
                  <option value="payment failed">Payment Failed</option>
                  <option value="queries">Queries</option>
                  <option value="delivery">Delivery</option>
                  <option value="general faqs">General FAQs</option>
                  <option value="complaints">Complaints</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sentiment</label>
                <select
                  value={filterSentiment}
                  onChange={(e) => setFilterSentiment(e.target.value)}
                  className="block w-32 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All</option>
                  <option value="neutral">Neutral</option>
                  <option value="angry">Angry</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Agent</label>
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  className="block w-32 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All</option>
                  <option value="ai">AI Agent</option>
                  <option value="human">Human</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="block w-32 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>

              <div className="ml-auto">
                {(filterIntent || filterSentiment || filterAgent || filterStatus) && (
                  <button
                    onClick={() => {
                      setFilterIntent('');
                      setFilterSentiment('');
                      setFilterAgent('');
                      setFilterStatus('');
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors px-2 py-2"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading tickets…</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Ticket ID</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Subject</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Intent</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Sentiment</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Agent</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Status</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm italic">
                    {search ? 'No tickets match your search.' : 'No tickets found.'}
                  </td>
                </tr>
              ) : (
                filtered.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 text-sm font-mono text-emerald-500">{ticket.id.substring(0, 8)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-zinc-200 truncate max-w-[200px]">{ticket.sender_subject}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{ticket.sender_email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-zinc-400 capitalize">
                        {INTENT_ICONS[ticket.intent] ?? <Sparkles className="w-4 h-4" />}
                        {ticket.intent}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${SENTIMENT_COLORS[ticket.sentiment] ?? SENTIMENT_COLORS.neutral}`}>
                        {ticket.sentiment}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.agent_type === 'ai' ? (
                        <div className="flex items-center gap-1.5 text-emerald-500 text-xs">
                          <CheckCircle2 className="w-3 h-3" /> AI
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-orange-400 text-xs">
                          <Users className="w-3 h-3" /> Human
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {ticket.status === 'resolved' ? (
                        <span className="text-xs text-emerald-500">Resolved</span>
                      ) : (
                        <span className="text-xs text-zinc-500">Open</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {new Date(ticket.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const AnalyticsPage = ({ tickets, loading, onRefresh }: { tickets: Ticket[]; loading: boolean; onRefresh: () => void }) => {
  const stats = useMemo(() => {
    const total = tickets.length;
    if (total === 0) return { total: 0, autoreplies: 0, neutralPercent: 0, angryPercent: 0, mostCommonIntent: 'N/A' };

    const autoreplies = tickets.filter(t => t.agent_type === 'ai').length;
    const neutral = tickets.filter(t => t.sentiment === 'neutral').length;
    const angry = tickets.filter(t => t.sentiment === 'angry').length;

    const intentCounts = tickets.reduce((acc, t) => {
      acc[t.intent] = (acc[t.intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommonIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    return {
      total,
      autoreplies,
      neutralPercent: Math.round((neutral / total) * 100),
      angryPercent: Math.round((angry / total) * 100),
      mostCommonIntent,
    };
  }, [tickets]);

  const chartData = useMemo(() => {
    const counts = tickets.reduce((acc, t) => {
      acc[t.intent] = (acc[t.intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .map(intent => ({
        name: intent.charAt(0).toUpperCase() + intent.slice(1),
        value: counts[intent],
      }));
  }, [tickets]);

  const sentimentData = [
    { name: 'Neutral', value: stats.neutralPercent, color: '#10b981' },
    { name: 'Angry',   value: stats.angryPercent,   color: '#ef4444' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h2>
          <p className="text-zinc-500 text-sm mt-1">Real-time performance metrics and customer sentiment analysis.</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 bg-zinc-900 border border-white/5 rounded-lg text-zinc-400 hover:text-zinc-100 disabled:opacity-50 transition-colors"
          title="Refresh"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading data…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Total Tickets',     value: stats.total,               icon: Inbox,        color: 'text-blue-500' },
              { label: 'AI Auto-Replies',   value: stats.autoreplies,         icon: Send,         color: 'text-emerald-500' },
              { label: 'Neutral Sentiment', value: `${stats.neutralPercent}%`, icon: CheckCircle2, color: 'text-emerald-400' },
              { label: 'Angry Sentiment',   value: `${stats.angryPercent}%`,   icon: AlertCircle,  color: 'text-red-500' },
            ].map((stat, i) => (
              <div key={i} className="p-6 bg-zinc-900/50 border border-white/5 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Live</span>
                </div>
                <div className="text-3xl font-bold tracking-tight text-zinc-100">{stat.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 p-6 bg-zinc-900/50 border border-white/5 rounded-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-semibold text-zinc-200">Intent Distribution</h3>
                <div className="text-xs text-zinc-500">
                  Most common: <span className="text-emerald-500 capitalize">{stats.mostCommonIntent}</span>
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-zinc-600 text-sm">No data yet</div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} itemStyle={{ color: '#10b981' }} />
                      <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 p-6 bg-zinc-900/50 border border-white/5 rounded-2xl">
              <h3 className="font-semibold text-zinc-200 mb-8">Sentiment Breakdown</h3>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {sentimentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 mt-4">
                {sentimentData.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-zinc-400">{s.name}</span>
                    </div>
                    <span className="text-zinc-200 font-medium">{s.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// --- Knowledge Base Page ---

interface KBDocument {
  filename: string;
  size_bytes: number;
  last_modified: number;
}

const KnowledgeBasePage = () => {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch('/api/kb/documents');
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setUploadStatus({ type: 'error', message: 'Only .txt files are supported.' });
      return;
    }
    setUploading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/kb/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Upload failed');
      setUploadStatus({ type: 'success', message: data.message });
      await fetchDocuments();
    } catch (e: any) {
      setUploadStatus({ type: 'error', message: e.message ?? 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete "${filename}" from the knowledge base?`)) return;
    setDeletingFile(filename);
    try {
      const res = await fetch(`/api/kb/documents/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await fetchDocuments();
    } catch {
      alert('Failed to delete file.');
    } finally {
      setDeletingFile(null);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Upload Knowledge Base</h2>
        <p className="text-zinc-500 text-sm mt-1">
          Upload <code className="text-emerald-400 bg-emerald-500/10 px-1 rounded">.txt</code> files to expand the AI's knowledge. Each file is automatically embedded into the vector store.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-emerald-500 bg-emerald-500/10 scale-[1.01]'
            : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
        />
        {uploading ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-zinc-200 font-semibold">Embedding into vector store…</p>
              <p className="text-zinc-500 text-sm mt-1">This may take a few seconds</p>
            </div>
          </>
        ) : (
          <>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isDragging ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
              <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-emerald-400' : 'text-zinc-500'}`} />
            </div>
            <div className="text-center">
              <p className="text-zinc-200 font-semibold">Drop a .txt file here or click to browse</p>
              <p className="text-zinc-500 text-sm mt-1">The file will be saved and immediately embedded into the RAG pipeline</p>
            </div>
            <span className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold rounded-xl transition-colors pointer-events-none">
              Choose File
            </span>
          </>
        )}
      </div>

      {/* Status Banner */}
      {uploadStatus && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-start gap-3 p-4 rounded-xl border ${
            uploadStatus.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {uploadStatus.type === 'success'
            ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
            : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
          <p className="text-sm">{uploadStatus.message}</p>
        </motion.div>
      )}

      {/* Documents List */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-400">
            <BookOpen className="w-4 h-4" />
            Current Knowledge Base
            {!loadingDocs && (
              <span className="ml-1 px-2 py-0.5 bg-zinc-800 text-zinc-500 text-xs rounded-full">{documents.length} files</span>
            )}
          </div>
          <button
            onClick={fetchDocuments}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-zinc-500 hover:text-zinc-200"
            title="Refresh"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>

        {loadingDocs ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-zinc-600 text-sm">
            No knowledge base documents found. Upload a .txt file above.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {documents.map((doc) => (
              <li key={doc.filename} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{doc.filename}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {formatSize(doc.size_bytes)} · Last modified {new Date(doc.last_modified * 1000).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  disabled={deletingFile === doc.filename}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Delete"
                >
                  {deletingFile === doc.filename
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// --- Order Tracking Page ---

const AddOrderModal = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: Order) => void;
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [product, setProduct] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('Pending');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() && email.trim() && product.trim() && orderDate && dueDate && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await API.createOrder({
        name: name.trim(),
        email: email.trim(),
        product: product.trim(),
        order_date: orderDate,
        delivery_due_date: dueDate,
        delivery_status: status,
      });
      onCreated(order);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-100">Add Order</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Customer Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Product</label>
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Wireless Headphones"
              className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Order Date</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Delivery Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="Pending">Pending</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Delayed">Delayed</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="p-5 border-t border-white/5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Order'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const OrderTrackingPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await API.getOrders();
      setOrders(data);
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleStatusChange = async (order: Order, newStatus: string) => {
    try {
      const updated = await API.updateOrder(order.id, { delivery_status: newStatus });
      setOrders(prev => prev.map(o => (o.id === order.id ? updated : o)));
    } catch (e: any) {
      alert(e.message ?? 'Failed to update order');
    }
  };

  const handleDelete = async (order: Order) => {
    if (!confirm(`Delete the order for "${order.product}" (${order.email})?`)) return;
    try {
      await API.deleteOrder(order.id);
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (e: any) {
      alert(e.message ?? 'Failed to delete order');
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o =>
      o.name.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      o.product.toLowerCase().includes(q)
    );
  }, [orders, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Order Tracking</h2>
          <p className="text-zinc-500 text-sm mt-1">Manage customer orders and delivery statuses.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders..."
              className="pl-9 pr-4 py-2 bg-zinc-900 border border-white/5 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500 outline-none w-56 text-zinc-200"
            />
          </div>
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="p-2 bg-zinc-900 border border-white/5 rounded-lg text-zinc-400 hover:text-zinc-100 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <Truck className="w-4 h-4" />
            Add Order
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading orders…</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Name</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Email</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Product</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Order Date</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Due Date</th>
                <th className="px-6 py-4 text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm italic">
                    {search ? 'No orders match your search.' : 'No orders yet. Click "Add Order" to create one.'}
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-zinc-200">{order.name}</td>
                    <td className="px-6 py-4 text-sm text-zinc-400">{order.email}</td>
                    <td className="px-6 py-4 text-sm text-zinc-300">{order.product}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{order.order_date}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{order.delivery_due_date}</td>
                    <td className="px-6 py-4">
                      <select
                        value={order.delivery_status}
                        onChange={(e) => handleStatusChange(order, e.target.value)}
                        className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase border bg-transparent outline-none cursor-pointer ${DELIVERY_STATUS_COLORS[order.delivery_status] ?? DELIVERY_STATUS_COLORS.Pending}`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Delayed">Delayed</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(order)}
                        className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {showAddModal && (
          <AddOrderModal
            onClose={() => setShowAddModal(false)}
            onCreated={(order) => {
              setOrders(prev => [order, ...prev]);
              setShowAddModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {

  const [activePage, setActivePage] = useState<Page>('create-ticket');
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await API.getTickets();
      setTickets(data);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and whenever user navigates to a data page
  useEffect(() => {
    if (activePage !== 'create-ticket') {
      loadTickets();
    }
  }, [activePage, loadTickets]);

  const handleTicketProcessed = useCallback((ticket: Ticket) => {
    setTickets(prev => [ticket, ...prev]);
  }, []);

  const humanTickets = useMemo(
    () => tickets.filter(t => t.agent_type === 'human'),
    [tickets]
  );

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 font-sans selection:bg-emerald-500/30 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 h-screen flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="text-black w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">SupportFlow</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem id="create-ticket"  icon={LayoutDashboard} label="Create a Ticket"       active={activePage === 'create-ticket'}  onClick={setActivePage} />
          <SidebarItem id="tickets"        icon={Inbox}           label="All Tickets"            active={activePage === 'tickets'}        onClick={setActivePage} />
          <SidebarItem id="human-tickets"  icon={Users}           label="Human Assigned"         active={activePage === 'human-tickets'}  onClick={setActivePage} />
          <SidebarItem id="analytics"      icon={BarChart3}       label="Analytics Dashboard"    active={activePage === 'analytics'}      onClick={setActivePage} />
          <SidebarItem id="order-tracking" icon={Truck}           label="Order Tracking"         active={activePage === 'order-tracking'} onClick={setActivePage} />
          <SidebarItem id="upload-kb"      icon={BookOpen}        label="Upload Knowledge Base"  active={activePage === 'upload-kb'}      onClick={setActivePage} />
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
              <User className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">Support Agent</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-zinc-500">System Online</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-white/5 bg-black/20 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              System Active
            </span>
            <span className="mx-2 text-zinc-800">/</span>
            <span className="capitalize">{activePage.replace(/-/g, ' ')}</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors" title="History">
              <Clock className="w-4 h-4" />
            </button>
            <button className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors" title="Open docs">
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activePage === 'create-ticket' && (
                <ProcessorPage onTicketProcessed={handleTicketProcessed} />
              )}
              {activePage === 'tickets' && (
                <TicketsPage
                  tickets={tickets}
                  loading={loading}
                  onRefresh={loadTickets}
                />
              )}
              {activePage === 'human-tickets' && (
                <TicketsPage
                  tickets={humanTickets}
                  loading={loading}
                  onRefresh={loadTickets}
                  title="Human Assigned Tickets"
                  subtitle="Tickets routed to human agents for manual handling."
                />
              )}
              {activePage === 'analytics' && (
                <AnalyticsPage
                  tickets={tickets}
                  loading={loading}
                  onRefresh={loadTickets}
                />
              )}
              {activePage === 'order-tracking' && (
                <OrderTrackingPage />
              )}
              {activePage === 'upload-kb' && (
                <KnowledgeBasePage />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
