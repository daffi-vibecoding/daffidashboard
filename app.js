const state = {
  kanban: null,
  usage: null,
  theme: 'dark',
};

const el = (id) => document.getElementById(id);

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US').format(value ?? 0);

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value ?? 0);

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString();
};

const safeText = (value) => (value ? String(value) : '—');

const randomId = () =>
  (crypto?.randomUUID && crypto.randomUUID()) ||
  `card-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function loadKanban() {
  try {
    const data = await fetchJson('/api/kanban');
    state.kanban = data;
    renderKanban();
  } catch (err) {
    console.error(err);
  }
}

async function saveKanban() {
  if (!state.kanban) return;
  try {
    await fetchJson('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.kanban),
    });
  } catch (err) {
    console.error(err);
    alert(`Failed to save kanban: ${err.message}`);
  }
}

function renderKanban() {
  const board = el('kanban-board');
  board.innerHTML = '';
  if (!state.kanban?.columns) return;

  state.kanban.columns.forEach((column) => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.columnId = column.id;

    const header = document.createElement('div');
    header.className = 'column-header';
    header.innerHTML = `<div>${column.title}</div><span>${column.cards.length}</span>`;

    colEl.appendChild(header);

    column.cards.forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card-item';
      cardEl.draggable = true;
      cardEl.dataset.cardId = card.id;
      cardEl.dataset.columnId = column.id;
      cardEl.innerHTML = `<p>${card.title}</p><div class="card-meta">${safeText(
        card.owner
      )}</div>`;

      cardEl.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', JSON.stringify({
          cardId: card.id,
          fromColumn: column.id,
        }));
      });

      cardEl.addEventListener('dblclick', () => {
        const next = prompt('Edit card title. Leave empty to delete.', card.title);
        if (next === null) return;
        if (!next.trim()) {
          column.cards = column.cards.filter((c) => c.id !== card.id);
        } else {
          card.title = next.trim();
        }
        saveKanban();
        renderKanban();
      });

      colEl.appendChild(cardEl);
    });

    colEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      colEl.classList.add('drop-target');
    });

    colEl.addEventListener('dragleave', () => {
      colEl.classList.remove('drop-target');
    });

    colEl.addEventListener('drop', (event) => {
      event.preventDefault();
      colEl.classList.remove('drop-target');
      const payload = JSON.parse(event.dataTransfer.getData('text/plain'));
      moveCard(payload.cardId, payload.fromColumn, column.id);
    });

    board.appendChild(colEl);
  });
}

function moveCard(cardId, fromColumnId, toColumnId) {
  if (fromColumnId === toColumnId) return;
  const fromColumn = state.kanban.columns.find((c) => c.id === fromColumnId);
  const toColumn = state.kanban.columns.find((c) => c.id === toColumnId);
  if (!fromColumn || !toColumn) return;
  const cardIndex = fromColumn.cards.findIndex((c) => c.id === cardId);
  if (cardIndex < 0) return;
  const [card] = fromColumn.cards.splice(cardIndex, 1);
  toColumn.cards.unshift(card);
  saveKanban();
  renderKanban();
}

function addCard() {
  if (!state.kanban) return;
  const title = prompt('New card title');
  if (!title || !title.trim()) return;
  const owner = prompt('Owner (optional):', '');
  const backlog = state.kanban.columns.find((c) => c.id === 'backlog');
  backlog.cards.unshift({
    id: randomId(),
    title: title.trim(),
    owner: owner?.trim() || '—',
    createdAt: new Date().toISOString(),
  });
  saveKanban();
  renderKanban();
}

async function loadUsage() {
  try {
    const data = await fetchJson('/api/usage');
    state.usage = data;
    renderUsage();
    setStatus('Live', true);
  } catch (err) {
    console.error(err);
    setStatus('Offline', false);
  }
}

function setStatus(label, ok) {
  el('status-text').textContent = label;
  const dot = el('status-dot');
  dot.style.background = ok ? 'var(--good)' : 'var(--danger)';
  dot.style.boxShadow = ok ? '0 0 12px rgba(52, 211, 153, 0.6)' : '0 0 12px rgba(239, 68, 68, 0.6)';
}

function renderUsage() {
  const usage = state.usage;
  if (!usage) return;

  el('log-source').textContent = `Logs: ${usage.logDir || '—'}`;
  el('last-updated').textContent = `Updated: ${formatDateTime(usage.lastUpdated)}`;

  const summaryCards = el('summary-cards');
  summaryCards.innerHTML = '';

  const cards = [
    {
      label: 'Total Spend',
      value: formatCurrency(usage.summary.totalCost),
    },
    {
      label: 'Total Requests',
      value: formatNumber(usage.summary.totalRequests),
    },
    {
      label: 'Input Tokens',
      value: formatNumber(usage.summary.tokens.input),
    },
    {
      label: 'Output Tokens',
      value: formatNumber(usage.summary.tokens.output),
    },
    {
      label: 'Cache Tokens',
      value: formatNumber(usage.summary.tokens.cache),
    },
  ];

  cards.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card stat';
    card.innerHTML = `<div class="stat-value">${item.value}</div><div class="stat-label">${item.label}</div>`;
    summaryCards.appendChild(card);
  });

  renderList('provider-breakdown', usage.providers, formatCurrency);
  renderList('token-breakdown', usage.tokenBreakdown, formatNumber);
  renderList('user-breakdown', usage.users, formatCurrency);

  renderRealtime(usage.realtime);

  renderBarChart(el('daily-chart'), usage.timeseries.daily);
  renderLineChart(el('weekly-chart'), usage.timeseries.weekly);
  renderLineChart(el('monthly-chart'), usage.timeseries.monthly);

  const warningsEl = el('warnings');
  if (usage.warnings?.length) {
    warningsEl.style.display = 'block';
    warningsEl.textContent = usage.warnings.join(' ');
  } else {
    warningsEl.style.display = 'none';
  }
}

function renderList(targetId, entries, formatter) {
  const container = el(targetId);
  container.innerHTML = '';
  const items = Object.entries(entries || {});
  if (!items.length) {
    container.innerHTML = '<div class="list-row"><div>—</div><span>—</span></div>';
    return;
  }

  items.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div>${label}</div><span>${formatter(value)}</span>`;
    container.appendChild(row);
  });
}

function renderRealtime(data) {
  const container = el('realtime');
  if (!data) {
    container.textContent = '—';
    return;
  }
  container.innerHTML = `
    <div>Window: last ${data.windowMinutes} min</div>
    <div>Requests: ${formatNumber(data.requests)}</div>
    <div>Spend: ${formatCurrency(data.cost)}</div>
    <div>Input: ${formatNumber(data.tokens.input)}</div>
    <div>Output: ${formatNumber(data.tokens.output)}</div>
    <div>Cache: ${formatNumber(data.tokens.cache)}</div>
  `;
}

function renderBarChart(canvas, series) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.clearRect(0, 0, width, height);

  if (!series?.length) return;
  const values = series.map((d) => d.value);
  const max = Math.max(...values, 1);
  const barWidth = width / series.length;

  series.forEach((point, index) => {
    const barHeight = (point.value / max) * (height * 0.8);
    const x = index * barWidth + barWidth * 0.15;
    const y = height - barHeight;
    ctx.fillStyle = 'rgba(99, 102, 241, 0.7)';
    ctx.fillRect(x, y, barWidth * 0.7, barHeight);
  });
}

function renderLineChart(canvas, series) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.clearRect(0, 0, width, height);

  if (!series?.length) return;
  const values = series.map((d) => d.value);
  const max = Math.max(...values, 1);
  const step = width / (series.length - 1 || 1);

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(63, 243, 200, 0.85)';
  ctx.lineWidth = 2 * window.devicePixelRatio;

  series.forEach((point, index) => {
    const x = index * step;
    const y = height - (point.value / max) * (height * 0.8) - height * 0.1;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = state.theme;
}

function init() {
  document.body.dataset.theme = state.theme;
  el('add-card-btn').addEventListener('click', addCard);
  el('refresh-btn').addEventListener('click', () => {
    loadUsage();
    loadKanban();
  });
  el('theme-btn').addEventListener('click', toggleTheme);

  loadKanban();
  loadUsage();
  setInterval(loadUsage, 10000);
}

window.addEventListener('load', init);
window.addEventListener('resize', () => {
  if (state.usage) {
    renderUsage();
  }
});
