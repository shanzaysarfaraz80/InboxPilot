/* ─────────────────────────────────────────────────────────────────────────
   CS Support Operations System — Frontend App
   ─────────────────────────────────────────────────────────────────────── */

const API_BASE = '';  // same origin

// ─── Sample Emails ──────────────────────────────────────────────────────────
const SAMPLES = {
  angry: {
    email: 'angry.customer@example.com',
    subject: 'Transaction Failed AGAIN — Fix This NOW',
    body: "I am absolutely furious! My payment has failed for the third time this week. I was charged $99.99 but the transaction failed and the money still left my account. This is completely unacceptable. I demand an immediate refund and a proper explanation. If this isn't resolved today I'm disputing the charge with my bank and leaving a 1-star review everywhere.",
  },
  security: {
    email: 'victim@example.com',
    subject: 'Someone hacked my account — URGENT',
    body: "I think my account has been compromised. I received a notification of a login from a location I've never been to (Singapore). I did not log in from there. My password may have been stolen. I'm very worried about my personal and financial data being exposed. Please help me secure my account immediately.",
  },
  general: {
    email: 'curious@example.com',
    subject: 'What are your support hours?',
    body: "Hi, I just wanted to know what your customer support hours are and what payment methods you accept. Also, do you have a mobile app? I prefer to manage things on my phone. Thanks!",
  },
  tech: {
    email: 'user@example.com',
    subject: 'App not loading — blank screen',
    body: "The app has been showing a blank white screen for the past 2 hours. I've tried refreshing the page and clearing my browser cache but nothing works. I'm using Chrome on Windows 11. Could you please let me know if there's an ongoing outage or if there's something else I can try?",
  },
};

// ─── DOM References ─────────────────────────────────────────────────────────
const form = document.getElementById('emailForm');
const senderEmail = document.getElementById('senderEmail');
const senderSubject = document.getElementById('senderSubject');
const senderBody = document.getElementById('senderBody');
const submitBtn = document.getElementById('submitBtn');
const submitBtnText = document.getElementById('submitBtnText');
const submitSpinner = document.getElementById('submitSpinner');
const resultPanel = document.getElementById('resultPanel');
const resultJson = document.getElementById('resultJson');
const resultClose = document.getElementById('resultClose');

const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const ticketsTableWrap = document.getElementById('ticketsTableWrap');
const ticketsTbody = document.getElementById('ticketsTbody');
const refreshBtn = document.getElementById('refreshBtn');

// Filters
const ticketsFilters = document.getElementById('ticketsFilters');
const filterIntent = document.getElementById('filterIntent');
const filterSentiment = document.getElementById('filterSentiment');
const filterAgent = document.getElementById('filterAgent');
const filterStatus = document.getElementById('filterStatus');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

window.allTickets = [];

const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalGrid = document.getElementById('modalGrid');
const modalReply = document.getElementById('modalReply');
const modalJson = document.getElementById('modalJson');

// Stats
const statTotal = document.getElementById('statTotal');
const statAI = document.getElementById('statAI');
const statHuman = document.getElementById('statHuman');
const statResolved = document.getElementById('statResolved');

// ─── Badge Helpers ───────────────────────────────────────────────────────────
function intentBadge(intent) {
  const map = {
    'Account Issues': 'account',
    'Billing Issues': 'billing',
    'Technical Issues': 'technical',
    'Security Issues': 'security',
    'General Support': 'general',
  };
  const cls = map[intent] || 'general';
  return `<span class="badge badge-${cls}">${intent}</span>`;
}

function sentimentBadge(sentiment) {
  const icons = { Angry: '😡', Neutral: '😐', Happy: '😊' };
  const cls = (sentiment || '').toLowerCase();
  return `<span class="badge badge-${cls}">${icons[sentiment] || ''} ${sentiment}</span>`;
}

function agentBadge(agent) {
  const isHuman = agent && agent.toLowerCase().includes('human');
  return `<span class="badge badge-${isHuman ? 'human' : 'ai'}">${isHuman ? '👤 Human Agent' : '🤖 AI Agent'}</span>`;
}

function statusBadge(status) {
  const isResolved = status === 'Resolved';
  return `<span class="badge badge-${isResolved ? 'resolved' : 'notresolved'}">${isResolved ? '✅ Resolved' : '❌ Not Resolved'}</span>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Sample Buttons ──────────────────────────────────────────────────────────
document.getElementById('sampleAngry').addEventListener('click', () => fillSample('angry'));
document.getElementById('sampleSecurity').addEventListener('click', () => fillSample('security'));
document.getElementById('sampleGeneral').addEventListener('click', () => fillSample('general'));
document.getElementById('sampleTech').addEventListener('click', () => fillSample('tech'));

function fillSample(key) {
  const s = SAMPLES[key];
  senderEmail.value = s.email;
  senderSubject.value = s.subject;
  senderBody.value = s.body;
  resultPanel.classList.add('hidden');
}

// ─── Form Submit ─────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultPanel.classList.add('hidden');

  submitBtnText.textContent = 'Processing…';
  submitSpinner.classList.remove('hidden');
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_email: senderEmail.value.trim(),
        sender_subject: senderSubject.value.trim(),
        sender_body_email: senderBody.value.trim(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Server error');
    }

    const ticket = await res.json();

    // Show result
    resultJson.textContent = JSON.stringify(ticket, null, 2);
    resultPanel.classList.remove('hidden');

    // Refresh the ticket list
    await loadTickets();
  } catch (err) {
    alert(`❌ Error: ${err.message}`);
  } finally {
    submitBtnText.textContent = 'Process Email →';
    submitSpinner.classList.add('hidden');
    submitBtn.disabled = false;
  }
});

// ─── Close Result Panel ──────────────────────────────────────────────────────
resultClose.addEventListener('click', () => resultPanel.classList.add('hidden'));

// ─── Load Tickets ─────────────────────────────────────────────────────────────
async function loadTickets() {
  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  ticketsTableWrap.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/api/tickets`);
    if (!res.ok) throw new Error(res.statusText);
    window.allTickets = await res.json();

    ticketsFilters.style.display = 'flex'; // show filters once loaded
    renderStats(window.allTickets);
    applyFilters();
  } catch (err) {
    loadingState.innerHTML = `<p style="color:var(--sentiment-angry)">Failed to load tickets: ${err.message}</p>`;
  }
}

function applyFilters() {
  const intentVal = filterIntent.value;
  const sentimentVal = filterSentiment.value;
  const agentVal = filterAgent.value;
  const statusVal = filterStatus.value;
  
  const hasFilters = intentVal || sentimentVal || agentVal || statusVal;
  clearFiltersBtn.style.display = hasFilters ? 'block' : 'none';

  const filtered = window.allTickets.filter(t => {
    if (intentVal && t.intent !== intentVal) return false;
    if (sentimentVal && t.sentiment !== sentimentVal) return false;
    if (agentVal && t.agent_type !== agentVal) return false;
    if (statusVal && t.status !== statusVal) return false;
    return true;
  });

  renderTable(filtered);
}

filterIntent.addEventListener('change', applyFilters);
filterSentiment.addEventListener('change', applyFilters);
filterAgent.addEventListener('change', applyFilters);
filterStatus.addEventListener('change', applyFilters);

clearFiltersBtn.addEventListener('click', () => {
  filterIntent.value = '';
  filterSentiment.value = '';
  filterAgent.value = '';
  filterStatus.value = '';
  applyFilters();
});

function renderStats(tickets) {
  statTotal.textContent = tickets.length;
  statAI.textContent = tickets.filter(t => t.agent_type === 'AI Agent').length;
  statHuman.textContent = tickets.filter(t => t.agent_type === 'Human Agent').length;
  statResolved.textContent = tickets.filter(t => t.status === 'Resolved').length;
}

function renderTable(tickets) {
  loadingState.classList.add('hidden');

  if (!tickets.length) {
    emptyState.classList.remove('hidden');
    return;
  }

  ticketsTbody.innerHTML = tickets.map(t => `
    <tr data-id="${t.id}" onclick="openModal(${JSON.stringify(t).replace(/"/g, '&quot;')})">
      <td title="${t.sender_email}">${t.sender_email}</td>
      <td title="${t.sender_subject}">${t.sender_subject || '—'}</td>
      <td>${intentBadge(t.intent)}</td>
      <td>${sentimentBadge(t.sentiment)}</td>
      <td>${agentBadge(t.agent_type)}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${formatDate(t.created_at)}</td>
    </tr>
  `).join('');

  ticketsTableWrap.classList.remove('hidden');
}

// ─── Refresh ─────────────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', loadTickets);

// ─── Modal ───────────────────────────────────────────────────────────────────
function openModal(ticket) {
  modalTitle.textContent = ticket.sender_subject || 'Ticket Details';

  // Meta grid
  const metaItems = [
    { label: 'Sender Email', value: ticket.sender_email },
    { label: 'Intent', value: intentBadge(ticket.intent), raw: true },
    { label: 'Sentiment', value: sentimentBadge(ticket.sentiment), raw: true },
    { label: 'Agent', value: agentBadge(ticket.agent_type), raw: true },
    { label: 'Status', value: statusBadge(ticket.status), raw: true },
    { label: 'Created', value: formatDate(ticket.created_at) },
  ];

  modalGrid.innerHTML = metaItems.map(item => `
    <div class="modal-meta-item">
      <div class="meta-label">${item.label}</div>
      <div class="meta-value">${item.raw ? item.value : escapeHtml(item.value ?? '—')}</div>
    </div>
  `).join('');

  // Body preview
  if (ticket.sender_body_email) {
    modalGrid.innerHTML += `
      <div class="modal-meta-item" style="grid-column: 1 / -1;">
        <div class="meta-label">Email Body</div>
        <div class="meta-value" style="white-space:pre-wrap; font-size:13px; line-height:1.6;">${escapeHtml(ticket.sender_body_email)}</div>
      </div>`;
  }

  // AI Reply
  modalReply.textContent = ticket.ai_reply || 'No reply generated.';

  // Full JSON
  modalJson.textContent = JSON.stringify(ticket, null, 2);

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ─── Escape HTML ─────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadTickets();
