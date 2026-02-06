import { createClient } from '@supabase/supabase-js';

const ALLOWED_EMAILS = ['dfirwin2@gmail.com', 'jones.amanda892@gmail.com', 'daffi@donirwin.xyz'];
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const USAGE_API_URL = import.meta.env.VITE_USAGE_API_URL || '';

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const DEFAULT_COLUMNS = [
  { title: 'Backlog', position: 1 },
  { title: 'In Progress', position: 2 },
  { title: 'Done', position: 3 },
  { title: 'Blocked', position: 4 },
];

const VIEW_ONLY = true;

const state = {
  user: null,
  board: null,
  kanban: null,
  usage: null,
  theme: 'dark',
  compact: false,
  filters: {
    query: '',
    owner: 'all',
    priority: 'all',
  },
  modal: {
    open: false,
    mode: 'create',
    cardId: null,
    columnId: null,
  },
  lastKanbanSaved: null,
  usageLoading: false,
  usageError: null,
  authReady: false,
  activeRoute: 'tasks',
  activeColumnId: null,
  isNarrow: false,
  cronJobs: [],
  cronFilter: '',
  selectedCronId: null,
  systemEvents: [],
};

const el = (id) => document.getElementById(id);
const STORAGE_KEYS = {
  theme: 'oc_theme',
  compact: 'oc_compact',
  filters: 'oc_kanban_filters',
  route: 'oc_active_route',
};

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
const safeValue = (value) =>
  value === undefined || value === null || value === '' ? '—' : String(value);

const coalesce = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '');

const toDate = (value) => {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatAge = (value) => {
  const date = toDate(value);
  if (!date) return 'Unknown';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'Just now';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
};

const normalizeTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const normalizePriority = (value) => {
  const options = ['low', 'medium', 'high', 'critical'];
  return options.includes(value) ? value : 'medium';
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const createEl = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

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

function loadPreferences() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme);
  const compact = localStorage.getItem(STORAGE_KEYS.compact);
  const filters = localStorage.getItem(STORAGE_KEYS.filters);
  const route = localStorage.getItem(STORAGE_KEYS.route);
  if (theme) state.theme = theme;
  if (compact) state.compact = compact === 'true';
  if (route) {
    const routeMap = {
      kanban: 'tasks',
      cron: 'notes',
      metrics: 'projects',
    };
    state.activeRoute = routeMap[route] || route;
  }
  if (filters) {
    try {
      const parsed = JSON.parse(filters);
      state.filters = { ...state.filters, ...parsed };
    } catch (err) {
      console.warn('Failed to parse saved filters', err);
    }
  }
}

function persistPreferences() {
  localStorage.setItem(STORAGE_KEYS.theme, state.theme);
  localStorage.setItem(STORAGE_KEYS.compact, String(state.compact));
  localStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(state.filters));
  localStorage.setItem(STORAGE_KEYS.route, state.activeRoute);
}

function setStatus(label, ok) {
  el('status-text').textContent = label;
  const dot = el('status-dot');
  dot.style.background = ok ? 'var(--good)' : 'var(--danger)';
  dot.style.boxShadow = ok ? '0 0 12px rgba(52, 211, 153, 0.6)' : '0 0 12px rgba(239, 68, 68, 0.6)';
}

function updateNav(route) {
  const routes = {
    tasks: 'kanban-panel',
    notes: 'cron-panel',
    projects: 'metrics-panel',
    system: 'system-panel',
  };

  if (!routes[route]) {
    route = 'tasks';
  }
  state.activeRoute = route;
  persistPreferences();
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const isActive = btn.dataset.route === route;
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  Object.entries(routes).forEach(([key, id]) => {
    const panel = el(id);
    if (!panel) return;
    panel.style.display = key === route ? 'block' : 'none';
  });
  
  // Load system data when switching to system view
  if (route === 'system') {
    loadSystemStatus();
    loadSystemEvents();
  }
}

function updateAuthUI() {
  const authPanel = el('auth-panel');
  const userChip = el('user-email');
  const signOutBtn = el('sign-out-btn');

  if (state.user) {
    authPanel.style.display = 'none';
    userChip.textContent = state.user.email;
    signOutBtn.style.display = 'inline-flex';
  } else {
    authPanel.style.display = 'grid';
    userChip.textContent = 'Signed out';
    signOutBtn.style.display = 'none';
    // Reset auth forms
    el('auth-form').style.display = 'block';
    el('otp-form').style.display = 'none';
    el('auth-email').value = '';
    el('otp-code').value = '';
    setAuthMessage('', 'info');
  }
}

function setAuthMessage(text, type = 'info') {
  const message = el('auth-message');
  if (!message) return;
  message.textContent = text;
  message.dataset.type = type;
}

function isAllowedEmail(email) {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}

async function sendOTP(event) {
  event.preventDefault();
  const email = el('auth-email').value.trim().toLowerCase();
  if (!email) return;
  if (!isAllowedEmail(email)) {
    setAuthMessage('This email is not on the allowlist. Please use an approved address.', 'error');
    return;
  }
  if (!supabase) {
    setAuthMessage('Missing Supabase configuration.', 'error');
    return;
  }

  setAuthMessage('Sending code…', 'info');
  
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    setAuthMessage(`Failed to send code: ${error.message}`, 'error');
  } else {
    setAuthMessage('Code sent! Check your email and enter it below.', 'success');
    el('auth-form').style.display = 'none';
    el('otp-form').style.display = 'block';
    el('otp-code').focus();
  }
}

async function verifyOTP(event) {
  event.preventDefault();
  const email = el('auth-email').value.trim().toLowerCase();
  const token = el('otp-code').value.trim();
  
  if (!token || (token.length !== 6 && token.length !== 8)) {
    setAuthMessage('Please enter the code from your email.', 'error');
    return;
  }
  
  setAuthMessage('Verifying…', 'info');
  
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    setAuthMessage(`Verification failed: ${error.message}`, 'error');
  } else {
    setAuthMessage('Success! Signing you in…', 'success');
  }
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

async function handleSession(session) {
  if (session?.user) {
    const email = session.user.email?.toLowerCase();
    if (!isAllowedEmail(email)) {
      setAuthMessage('That account is not allowed. Contact an admin.', 'error');
      await supabase.auth.signOut();
      state.user = null;
      updateAuthUI();
      setStatus('Access denied', false);
      return;
    }
    state.user = session.user;
    updateAuthUI();
    setStatus('Live', true);
    await loadKanban();
    await loadCronJobs();
    if (USAGE_API_URL) {
      loadUsage();
    } else {
      renderUsageUnavailable();
    }
  } else {
    state.user = null;
    state.kanban = null;
    state.board = null;
    updateAuthUI();
    renderKanban();
    renderCronList();
    renderCronDetail();
    renderUsageUnavailable();
    setStatus('Signed out', false);
  }
}

async function initAuth() {
  if (!supabase) {
    setStatus('Missing Supabase config', false);
    setAuthMessage('Missing Supabase configuration. Check VITE_SUPABASE_URL/ANON_KEY.', 'error');
    updateAuthUI();
    return;
  }

  const { data } = await supabase.auth.getSession();
  await handleSession(data.session);

  supabase.auth.onAuthStateChange(async (_event, session) => {
    await handleSession(session);
  });
}

async function ensureBoard() {
  const { data: boards, error } = await supabase
    .from('boards')
    .select('*')
    .eq('owner_id', state.user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;

  if (boards && boards.length) {
    state.board = boards[0];
    return boards[0];
  }

  const { data: newBoard, error: insertError } = await supabase
    .from('boards')
    .insert({ title: 'OpenClaw Board', owner_id: state.user.id })
    .select()
    .single();

  if (insertError) throw insertError;

  const { error: columnsError } = await supabase
    .from('columns')
    .insert(
      DEFAULT_COLUMNS.map((column) => ({
        board_id: newBoard.id,
        title: column.title,
        position: column.position,
      }))
    );

  if (columnsError) throw columnsError;

  state.board = newBoard;
  return newBoard;
}

async function loadKanban() {
  if (!state.user || !supabase) return;
  try {
    const board = await ensureBoard();
    const { data: columns, error: columnsError } = await supabase
      .from('columns')
      .select('*')
      .eq('board_id', board.id)
      .order('position', { ascending: true });

    if (columnsError) throw columnsError;

    const columnIds = (columns || []).map((col) => col.id);
    let cards = [];
    if (columnIds.length) {
      const { data: cardRows, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .in('column_id', columnIds)
        .order('position', { ascending: false });

      if (cardsError) throw cardsError;
      cards = cardRows || [];
    }

    state.kanban = {
      columns: (columns || []).map((column) => ({
        id: column.id,
        title: column.title,
        position: column.position,
        cards: cards
          .filter((card) => card.column_id === column.id)
          .map((card) => ({
            id: card.id,
            title: card.title,
            owner: card.owner || '—',
            tags: card.tags || [],
            priority: card.priority || 'medium',
            dueDate: card.due_date,
            notes: card.notes || '',
            createdAt: card.created_at,
          })),
      })),
    };

    if (!state.activeColumnId && state.kanban.columns.length) {
      state.activeColumnId = state.kanban.columns[0].id;
    }

    updateOwnerFilter();
    updateKanbanMeta();
    renderKanban();
  } catch (err) {
    console.error(err);
    alert(`Failed to load tasks: ${err.message}`);
  }
}

function touchKanbanSaved() {
  state.lastKanbanSaved = new Date().toISOString();
  updateKanbanMeta();
}

function renderKanbanTabs() {
  const tabs = el('kanban-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  if (!state.kanban?.columns?.length) return;

  state.kanban.columns.forEach((column) => {
    const btn = createEl('button', 'tab-btn', column.title);
    if (column.id === state.activeColumnId) btn.setAttribute('aria-current', 'page');
    btn.addEventListener('click', () => {
      state.activeColumnId = column.id;
      renderKanban();
    });
    tabs.appendChild(btn);
  });
}

function renderKanban() {
  const board = el('kanban-board');
  if (!board) return;
  board.innerHTML = '';
  if (!state.kanban?.columns) return;

  renderKanbanTabs();

  const { query, owner, priority } = state.filters;
  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery || owner !== 'all' || priority !== 'all';

  let totalCards = 0;
  let visibleCards = 0;

  const columnsToRender = state.isNarrow
    ? state.kanban.columns.filter((col) => col.id === state.activeColumnId)
    : state.kanban.columns;

  columnsToRender.forEach((column) => {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    colEl.dataset.columnId = column.id;

    const header = createEl('div', 'column-header');
    const headerTitle = createEl('div', null, column.title);
    const headerCount = createEl('span');
    const filteredCards = (column.cards || []).filter((card) =>
      cardMatchesFilters(card, normalizedQuery, owner, priority)
    );
    headerCount.textContent = isFiltering
      ? `${filteredCards.length}/${column.cards.length}`
      : `${column.cards.length}`;
    header.append(headerTitle, headerCount);

    colEl.appendChild(header);

    column.cards.forEach((card) => {
      totalCards += 1;
      if (!cardMatchesFilters(card, normalizedQuery, owner, priority)) return;
      visibleCards += 1;
      const cardEl = document.createElement('div');
      cardEl.className = 'card-item';
      cardEl.draggable = !VIEW_ONLY;
      cardEl.dataset.cardId = card.id;
      cardEl.dataset.columnId = column.id;
      const title = createEl('p', null, safeText(card.title));
      const meta = createEl('div', 'card-meta');
      meta.append(createEl('span', null, safeText(card.owner)));
      if (card.dueDate) {
        meta.append(createEl('span', null, `Due ${formatDate(card.dueDate)}`));
      }
      const priorityValue = normalizePriority(card.priority);
      const priorityBadge = createEl(
        'span',
        `priority ${priorityValue}`,
        priorityValue.charAt(0).toUpperCase() + priorityValue.slice(1)
      );
      meta.append(priorityBadge);

      const tags = createEl('div', 'card-tags');
      normalizeTags(card.tags).forEach((tag) => {
        tags.append(createEl('span', 'tag', tag));
      });

      cardEl.append(title, meta);
      if (tags.children.length) cardEl.append(tags);

      if (!VIEW_ONLY) {
        cardEl.addEventListener('dragstart', (event) => {
          event.dataTransfer.setData('text/plain', JSON.stringify({
            cardId: card.id,
            fromColumn: column.id,
          }));
        });

        cardEl.addEventListener('click', () => openCardModal('edit', { ...card, columnId: column.id }));
      }

      colEl.appendChild(cardEl);
    });

    if (!VIEW_ONLY) {
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
    }

    board.appendChild(colEl);
  });

  const countEl = el('kanban-count');
  countEl.textContent = isFiltering ? `${visibleCards} / ${totalCards}` : `${totalCards}`;
}

function cardMatchesFilters(card, query, owner, priority) {
  const title = safeText(card.title).toLowerCase();
  const cardOwner = safeText(card.owner).toLowerCase();
  const tags = normalizeTags(card.tags).join(' ').toLowerCase();
  const priorityValue = normalizePriority(card.priority);
  const matchesQuery = !query || [title, cardOwner, tags].some((text) => text.includes(query));
  const matchesOwner = owner === 'all' || cardOwner === owner;
  const matchesPriority = priority === 'all' || priorityValue === priority;
  return matchesQuery && matchesOwner && matchesPriority;
}

function updateOwnerFilter() {
  const ownerSelect = el('kanban-owner');
  if (!ownerSelect) return;
  const owners = new Set();
  state.kanban?.columns?.forEach((column) => {
    column.cards?.forEach((card) => {
      if (card.owner && card.owner !== '—') owners.add(String(card.owner));
    });
  });
  const sorted = Array.from(owners).sort((a, b) => a.localeCompare(b));
  ownerSelect.innerHTML = '';
  const allOption = createEl('option', null, 'All');
  allOption.value = 'all';
  ownerSelect.appendChild(allOption);
  sorted.forEach((name) => {
    const opt = createEl('option', null, name);
    opt.value = name.toLowerCase();
    ownerSelect.appendChild(opt);
  });
  ownerSelect.value = state.filters.owner;
  if (!ownerSelect.value) {
    ownerSelect.value = 'all';
    state.filters.owner = 'all';
  }
}

function updateKanbanMeta() {
  const savedEl = el('kanban-saved');
  if (!savedEl) return;
  savedEl.textContent = state.lastKanbanSaved ? formatDateTime(state.lastKanbanSaved) : '—';
}

async function moveCard(cardId, fromColumnId, toColumnId) {
  if (VIEW_ONLY) return;
  if (fromColumnId === toColumnId) return;
  const fromColumn = state.kanban.columns.find((c) => c.id === fromColumnId);
  const toColumn = state.kanban.columns.find((c) => c.id === toColumnId);
  if (!fromColumn || !toColumn) return;
  const cardIndex = fromColumn.cards.findIndex((c) => c.id === cardId);
  if (cardIndex < 0) return;
  const [card] = fromColumn.cards.splice(cardIndex, 1);
  toColumn.cards.unshift(card);
  renderKanban();

  const { error } = await supabase
    .from('cards')
    .update({ column_id: toColumnId, position: Date.now() })
    .eq('id', cardId);

  if (error) {
    alert(`Failed to move card: ${error.message}`);
    await loadKanban();
    return;
  }

  touchKanbanSaved();
}

function addCard() {
  if (VIEW_ONLY) return;
  if (!state.kanban) return;
  openCardModal('create');
}

async function addColumn() {
  if (VIEW_ONLY) return;
  if (!state.kanban || !state.board) return;
  const title = prompt('New column title');
  if (!title || !title.trim()) return;
  const normalized = title.trim();
  const position = Math.max(0, ...state.kanban.columns.map((col) => col.position || 0)) + 1;

  const { data, error } = await supabase
    .from('columns')
    .insert({ board_id: state.board.id, title: normalized, position })
    .select()
    .single();

  if (error) {
    alert(`Failed to add column: ${error.message}`);
    return;
  }

  state.kanban.columns.push({ id: data.id, title: data.title, position: data.position, cards: [] });
  touchKanbanSaved();
  renderKanban();
  populateColumnOptions();
}

function populateColumnOptions(selectedId) {
  const select = el('card-column');
  if (!select || !state.kanban?.columns) return;
  select.innerHTML = '';
  state.kanban.columns.forEach((column) => {
    const opt = createEl('option', null, column.title);
    opt.value = column.id;
    select.appendChild(opt);
  });
  if (selectedId) select.value = selectedId;
}

function openCardModal(mode, card = {}) {
  const modal = el('card-modal');
  const form = el('card-form');
  if (!modal || !form) return;

  state.modal = {
    open: true,
    mode,
    cardId: card.id || null,
    columnId: card.columnId || state.kanban?.columns?.[0]?.id || null,
  };

  el('modal-title').textContent = mode === 'edit' ? 'Edit Card' : 'New Card';
  el('delete-card').style.display = mode === 'edit' ? 'inline-flex' : 'none';

  populateColumnOptions(state.modal.columnId);

  form.title.value = card.title || '';
  form.owner.value = card.owner && card.owner !== '—' ? card.owner : '';
  form.tags.value = normalizeTags(card.tags).join(', ');
  form.priority.value = normalizePriority(card.priority);
  form.dueDate.value = card.dueDate ? card.dueDate.slice(0, 10) : '';
  form.notes.value = card.notes || '';

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeCardModal() {
  const modal = el('card-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  state.modal.open = false;
}

function getCardById(cardId) {
  if (!state.kanban?.columns) return null;
  for (const column of state.kanban.columns) {
    const card = column.cards.find((item) => item.id === cardId);
    if (card) return { card, column };
  }
  return null;
}

async function handleCardSubmit(event) {
  event.preventDefault();
  if (VIEW_ONLY) return;
  if (!state.kanban || !state.board) return;
  const form = event.target;
  const data = {
    title: form.title.value.trim(),
    owner: form.owner.value.trim() || '—',
    tags: normalizeTags(form.tags.value),
    priority: normalizePriority(form.priority.value),
    dueDate: form.dueDate.value ? new Date(form.dueDate.value).toISOString() : null,
    notes: form.notes.value.trim(),
  };
  if (!data.title) return;

  if (state.modal.mode === 'edit' && state.modal.cardId) {
    const found = getCardById(state.modal.cardId);
    if (found) {
      Object.assign(found.card, data);
      if (form.column.value !== found.column.id) {
        found.column.cards = found.column.cards.filter((c) => c.id !== found.card.id);
        const destination = state.kanban.columns.find((c) => c.id === form.column.value);
        destination?.cards.unshift(found.card);
      }
    }

    const { error } = await supabase
      .from('cards')
      .update({
        title: data.title,
        owner: data.owner,
        tags: data.tags,
        priority: data.priority,
        due_date: data.dueDate,
        notes: data.notes,
        column_id: form.column.value,
        position: Date.now(),
      })
      .eq('id', state.modal.cardId);

    if (error) {
      alert(`Failed to update card: ${error.message}`);
      await loadKanban();
      return;
    }
  } else {
    const column = state.kanban.columns.find((c) => c.id === form.column.value) || state.kanban.columns[0];
    const newCard = {
      id: randomId(),
      title: data.title,
      owner: data.owner,
      tags: data.tags,
      priority: data.priority,
      dueDate: data.dueDate,
      notes: data.notes,
      createdAt: new Date().toISOString(),
    };
    column.cards.unshift(newCard);

    const { data: inserted, error } = await supabase
      .from('cards')
      .insert({
        column_id: column.id,
        title: data.title,
        owner: data.owner,
        tags: data.tags,
        priority: data.priority,
        due_date: data.dueDate,
        notes: data.notes,
        position: Date.now(),
      })
      .select()
      .single();

    if (error) {
      alert(`Failed to create card: ${error.message}`);
      await loadKanban();
      return;
    }

    newCard.id = inserted.id;
  }

  touchKanbanSaved();
  renderKanban();
  updateOwnerFilter();
  closeCardModal();
}

async function deleteCard() {
  if (VIEW_ONLY) return;
  if (!state.modal.cardId) return;
  const found = getCardById(state.modal.cardId);
  if (!found) return;
  found.column.cards = found.column.cards.filter((c) => c.id !== found.card.id);
  renderKanban();

  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('id', state.modal.cardId);

  if (error) {
    alert(`Failed to delete card: ${error.message}`);
    await loadKanban();
    return;
  }

  touchKanbanSaved();
  updateOwnerFilter();
  closeCardModal();
}

async function loadUsage() {
  if (!USAGE_API_URL) return renderUsageUnavailable();
  if (state.usageLoading) return;
  state.usageLoading = true;
  setStatus('Refreshing…', true);
  try {
    const data = await fetchJson(USAGE_API_URL);
    state.usage = data;
    state.usageError = null;
    renderUsage();
    setStatus('Live', true);
  } catch (err) {
    console.error(err);
    state.usageError = err.message;
    setStatus('Offline', false);
  } finally {
    state.usageLoading = false;
  }
}

function renderUsageUnavailable() {
  state.usage = null;
  el('log-source').textContent = 'Logs: Not configured';
  el('last-updated').textContent = 'Updated: —';
  el('log-files').textContent = 'Files: —';
  el('last-event').textContent = 'Last Event: —';
  el('summary-cards').innerHTML = '<div class="card">Usage API not configured for this deployment.</div>';
  el('provider-breakdown').innerHTML = '';
  el('token-breakdown').innerHTML = '';
  el('user-breakdown').innerHTML = '';
  el('realtime').textContent = '—';
  const warningsEl = el('warnings');
  warningsEl.style.display = 'block';
  warningsEl.textContent = 'Set VITE_USAGE_API_URL if you want to show API usage data.';
}

function downloadUsage() {
  if (!state.usage) return;
  const payload = JSON.stringify(state.usage, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `openclaw-usage-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function renderUsage() {
  const usage = state.usage;
  if (!usage) return;

  el('log-source').textContent = `Logs: ${usage.logDir || '—'}`;
  el('last-updated').textContent = `Updated: ${formatDateTime(usage.lastUpdated)}`;
  el('log-files').textContent = `Files: ${usage.sourceFiles?.length || 0}`;
  el('last-event').textContent = `Last Event: ${formatDateTime(usage.lastEventAt)}`;

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
      label: 'Avg Cost / Request',
      value: formatCurrency(usage.summary.avgCostPerRequest),
    },
    {
      label: 'Last 7d Spend',
      value: formatCurrency(usage.summary.last7dCost),
    },
    {
      label: 'Last 30d Spend',
      value: formatCurrency(usage.summary.last30dCost),
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
  const warnings = [...(usage.warnings || [])];
  if (state.usageError) warnings.unshift(`Usage error: ${state.usageError}`);
  if (warnings.length) {
    warningsEl.style.display = 'block';
    warningsEl.textContent = warnings.join(' ');
  } else {
    warningsEl.style.display = 'none';
  }
}

function renderList(targetId, entries, formatter) {
  const container = el(targetId);
  if (!container) return;
  container.innerHTML = '';
  const items = Object.entries(entries || {});
  if (!items.length) {
    const row = createEl('div', 'list-row');
    row.append(createEl('div', null, '—'), createEl('span', null, '—'));
    container.appendChild(row);
    return;
  }

  items.forEach(([label, value]) => {
    const row = createEl('div', 'list-row');
    row.append(createEl('div', null, label), createEl('span', null, formatter(value)));
    container.appendChild(row);
  });
}

function renderRealtime(data) {
  const container = el('realtime');
  if (!container) return;
  if (!data) {
    container.textContent = '—';
    return;
  }
  container.innerHTML = '';
  const rows = [
    `Window: last ${data.windowMinutes} min`,
    `Requests: ${formatNumber(data.requests)}`,
    `Spend: ${formatCurrency(data.cost)}`,
    `Input: ${formatNumber(data.tokens.input)}`,
    `Output: ${formatNumber(data.tokens.output)}`,
    `Cache: ${formatNumber(data.tokens.cache)}`,
  ];
  rows.forEach((rowText) => container.appendChild(createEl('div', null, rowText)));
}

function renderBarChart(canvas, series) {
  if (!canvas) return;
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
  if (!canvas) return;
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

async function loadCronJobs() {
  if (!state.user || !supabase) return;
  const { data, error } = await supabase
    .from('cron_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  state.cronJobs = data || [];
  renderCronList();
  renderCronDetail();
}

function renderCronList() {
  const list = el('cron-list');
  if (!list) return;
  list.innerHTML = '';
  const filter = state.cronFilter.trim().toLowerCase();
  const jobs = state.cronJobs.filter((job) => {
    if (!filter) return true;
    return [job.name, job.schedule, job.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(filter));
  });

  if (!jobs.length) {
    list.appendChild(createEl('div', 'empty', 'No cron jobs found.'));
    return;
  }

  jobs.forEach((job) => {
    const item = createEl('div', 'cron-item');
    item.dataset.id = job.id;
    item.append(createEl('div', 'title', job.name));
    const meta = createEl('div', 'meta');
    meta.append(createEl('span', null, job.schedule));
    meta.append(createEl('span', null, job.enabled ? 'Enabled' : 'Disabled'));
    meta.append(createEl('span', null, `Next: ${formatDateTime(job.next_run_at)}`));
    item.append(meta);
    item.addEventListener('click', () => {
      state.selectedCronId = job.id;
      renderCronDetail(job);
    });
    list.appendChild(item);
  });
}

function renderCronDetail(job = null) {
  const panel = el('cron-detail');
  if (!panel) return;
  const selected = job || state.cronJobs.find((item) => item.id === state.selectedCronId);
  if (!selected) {
    panel.innerHTML = '<div class="empty">Select a job to see details.</div>';
    return;
  }

  panel.innerHTML = `
    <div class="cron-detail-grid">
      <div>
        <h3>${selected.name}</h3>
        <p class="muted">${selected.description || 'No description provided.'}</p>
      </div>
      <div class="kv">
        <div class="k">Schedule</div><div>${selected.schedule}</div>
        <div class="k">Enabled</div><div>${selected.enabled ? 'Yes' : 'No'}</div>
        <div class="k">Last Run</div><div>${formatDateTime(selected.last_run_at)}</div>
        <div class="k">Next Run</div><div>${formatDateTime(selected.next_run_at)}</div>
        <div class="k">Created</div><div>${formatDateTime(selected.created_at)}</div>
      </div>
      <div>
        <div class="k">Raw Payload</div>
        <pre class="raw">${selected.raw_payload ? JSON.stringify(selected.raw_payload, null, 2) : '—'}</pre>
      </div>
    </div>
  `;
}

async function openCronCreate() {
  if (VIEW_ONLY) return;
  const panel = el('cron-detail');
  if (!panel) return;
  panel.innerHTML = `
    <form id="cron-form" class="cron-form">
      <div class="field">
        <label for="cron-name">Name</label>
        <input id="cron-name" name="name" type="text" required />
      </div>
      <div class="field">
        <label for="cron-schedule">Schedule</label>
        <input id="cron-schedule" name="schedule" type="text" placeholder="0 * * * *" required />
      </div>
      <div class="field">
        <label for="cron-description">Description</label>
        <input id="cron-description" name="description" type="text" />
      </div>
      <div class="field">
        <label for="cron-enabled">Enabled</label>
        <select id="cron-enabled" name="enabled">
          <option value="true" selected>Yes</option>
          <option value="false">No</option>
        </select>
      </div>
      <div class="field">
        <label for="cron-payload">Raw Payload (JSON)</label>
        <textarea id="cron-payload" name="raw_payload" rows="5" placeholder='{"job": "example"}'></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" id="cron-cancel">Cancel</button>
        <button type="submit" class="btn">Create</button>
      </div>
    </form>
  `;

  const form = el('cron-form');
  const cancel = el('cron-cancel');
  cancel.addEventListener('click', () => renderCronDetail());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payloadText = form.raw_payload.value.trim();
    let payload = null;
    if (payloadText) {
      try {
        payload = JSON.parse(payloadText);
      } catch (err) {
        alert('Raw payload must be valid JSON.');
        return;
      }
    }

    const { error } = await supabase
      .from('cron_jobs')
      .insert({
        name: form.name.value.trim(),
        schedule: form.schedule.value.trim(),
        description: form.description.value.trim(),
        enabled: form.enabled.value === 'true',
        raw_payload: payload,
      });

    if (error) {
      alert(`Failed to create cron job: ${error.message}`);
      return;
    }

    await loadCronJobs();
  });
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = state.theme;
  persistPreferences();
}

function updateResponsiveState() {
  state.isNarrow = window.matchMedia('(max-width: 900px)').matches;
  renderKanban();
}

// === System Status ===
async function loadSystemStatus() {
  if (!supabase) {
    el('sys-model').textContent = 'Auth required';
    renderEmailStatus(null, 'Auth required');
    return;
  }
  
  try {
    // Fetch system status from Supabase (synced every 10 minutes)
    const { data, error } = await supabase
      .from('system_status')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (error) throw error;
    
    renderSystemStatus(data);
  } catch (error) {
    console.error('Failed to load system status:', error);
    el('sys-model').textContent = 'No data yet';
    el('sys-sessions').textContent = '0';
    el('sys-default-model').textContent = 'Waiting for first sync';
    el('sys-gateway').textContent = '⚠ No data';
    renderEmailStatus(null, 'Waiting for first sync');
  }
}

function renderSystemStatus(data) {
  if (!data) {
    el('sys-model').textContent = 'No data';
    renderEmailStatus(null);
    return;
  }
  
  const config = data.config || {};
  const runtime = data.runtime || {};
  const sessions = data.sessions || [];
  
  // Calculate time since last update
  const lastUpdate = data.updated_at ? new Date(data.updated_at) : null;
  const minutesAgo = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 60000) : null;
  const updateText = minutesAgo !== null ? `${minutesAgo}m ago` : 'Unknown';
  
  // Overview stats
  el('sys-model').textContent = data.model || 'Unknown';
  el('sys-default-model').textContent = data.default_model || 'Unknown';
  el('sys-sessions').textContent = data.sessions_count || '0';
  // Health indicator: the status sync is scheduled every 10 minutes.
  // Treat anything >12 minutes as DOWN (missed its expected nudge).
  const isDown = minutesAgo === null || minutesAgo > 12;
  el('sys-gateway').textContent = isDown ? `✗ DOWN (last update: ${updateText})` : `✓ Online (${updateText})`;
  
  // Active sessions list
  const sessionsList = el('sessions-list');
  if (sessions.length === 0) {
    sessionsList.innerHTML = '<div class="list-item"><span class="list-label">No active sessions</span></div>';
  } else {
    sessionsList.innerHTML = sessions.slice(0, 20).map(sess => `
      <div class="list-item">
        <span class="list-label">${sess.label || sess.sessionKey || 'Unknown'}</span>
        <span class="list-value">${sess.kind || 'main'} - ${sess.model || data.model || '?'}</span>
      </div>
    `).join('');
  }
  
  // Configuration list
  const configList = el('config-list');
  configList.innerHTML = Object.entries({
    'Model': data.model || 'Not set',
    'Default Model': data.default_model || 'Not set',
    'Thinking': data.thinking || 'low',
    'Voice Enabled': config.voice ? 'Yes' : 'No',
    'Reactions': config.reactions || 'None',
  }).map(([key, val]) => `
    <div class="list-item">
      <span class="list-label">${key}</span>
      <span class="list-value">${val}</span>
    </div>
  `).join('');
  
  // Runtime info
  const runtimeList = el('runtime-list');
  runtimeList.innerHTML = Object.entries({
    'Agent': runtime.agent || '?',
    'Host': runtime.host || '?',
    'OS': runtime.os || '?',
    'Node Version': runtime.node || '?',
    'Repository': runtime.repo || '?',
  }).map(([key, val]) => `
    <div class="list-item">
      <span class="list-label">${key}</span>
      <span class="list-value">${val}</span>
    </div>
  `).join('');
  
  // Channel info
  const channelList = el('channel-list');
  channelList.innerHTML = Object.entries({
    'Channel': runtime.channel || config.channel || '?',
    'Capabilities': runtime.capabilities || 'None',
    'Model Override': data.model === data.default_model ? 'None' : data.model,
  }).map(([key, val]) => `
    <div class="list-item">
      <span class="list-label">${key}</span>
      <span class="list-value">${val}</span>
    </div>
  `).join('');

  renderEmailStatus(data.email);
}

function renderEmailStatus(email, fallback = null) {
  const list = el('email-list');
  if (!list) return;
  list.innerHTML = '';

  if (!email || typeof email !== 'object' || Object.keys(email || {}).length === 0) {
    const empty = createEl('div', 'list-item');
    empty.append(createEl('span', 'list-label', fallback || 'No email status yet'));
    list.append(empty);
    return;
  }

  const lastSync = coalesce(
    email.last_sync,
    email.lastSync,
    email.last_run,
    email.lastRun,
    email.updated_at,
    email.updatedAt,
    email.ts,
    email.timestamp,
  );
  const newCount = coalesce(
    email.new,
    email.new_count,
    email.newCount,
    email.added,
    email.added_count,
    email.received,
    email.processed_new,
  );
  const skippedCount = coalesce(
    email.skipped,
    email.skipped_count,
    email.skippedCount,
    email.ignored,
    email.ignored_count,
  );
  const status = coalesce(email.status, email.state, email.ok ? 'ok' : null);
  const error = coalesce(email.error, email.last_error, email.failure);

  const items = [
    { label: 'Last Sync', value: lastSync ? `${formatAge(lastSync)} (${formatDateTime(lastSync)})` : 'Unknown' },
    { label: 'New', value: newCount ?? '—' },
    { label: 'Skipped', value: skippedCount ?? '—' },
  ];
  if (status) items.push({ label: 'Status', value: status });
  if (error) items.push({ label: 'Error', value: error });

  items.forEach((item) => {
    const row = createEl('div', 'list-item');
    row.append(createEl('span', 'list-label', item.label));
    row.append(createEl('span', 'list-value', safeValue(item.value)));
    list.append(row);
  });
}

async function loadSystemEvents() {
  const list = el('events-list');
  if (!list) return;

  if (!supabase) {
    list.innerHTML = '<div class="list-item"><span class="list-label">Auth required</span></div>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('system_events')
      .select('ts, source, level, message')
      .order('ts', { ascending: false })
      .limit(25);

    if (error) throw error;
    state.systemEvents = data || [];
    renderSystemEvents();
  } catch (error) {
    console.error('Failed to load system events:', error);
    list.innerHTML = '<div class="list-item"><span class="list-label">No recent activity</span></div>';
  }
}

function renderSystemEvents() {
  const list = el('events-list');
  if (!list) return;
  list.innerHTML = '';

  if (!state.systemEvents.length) {
    list.innerHTML = '<div class="list-item"><span class="list-label">No recent activity</span></div>';
    return;
  }

  state.systemEvents.forEach((event) => {
    const row = createEl('div', 'list-item');
    const main = createEl('div', 'list-main');
    const meta = createEl(
      'span',
      'list-meta',
      `${formatDateTime(event.ts)} · ${safeText(event.source)} · ${safeText(event.level)}`
    );
    main.append(createEl('span', 'list-value', safeText(event.message)));
    main.append(meta);
    row.append(main);
    list.append(row);
  });
}

function applyViewOnlyUI() {
  const hideIds = [
    'add-column-btn',
    'add-card-btn',
    'cron-new',
    'save-card',
    'delete-card',
    'cron-save',
    'cron-delete',
  ];
  hideIds.forEach((id) => {
    const node = el(id);
    if (node) node.style.display = 'none';
  });
}

function init() {
  loadPreferences();
  document.body.dataset.theme = state.theme;
  document.body.classList.toggle('compact', state.compact);

  if (!VIEW_ONLY) {
    el('add-card-btn')?.addEventListener('click', addCard);
    el('add-column-btn')?.addEventListener('click', addColumn);
  }
  el('refresh-btn').addEventListener('click', () => {
    loadUsage();
    loadKanban();
    loadCronJobs();
  });
  el('theme-btn').addEventListener('click', toggleTheme);
  el('download-usage').addEventListener('click', downloadUsage);
  el('kanban-search').addEventListener('input', (event) => {
    state.filters.query = event.target.value;
    persistPreferences();
    renderKanban();
  });
  el('kanban-owner').addEventListener('change', (event) => {
    state.filters.owner = event.target.value;
    persistPreferences();
    renderKanban();
  });
  el('kanban-priority').addEventListener('change', (event) => {
    state.filters.priority = event.target.value;
    persistPreferences();
    renderKanban();
  });
  el('clear-filters').addEventListener('click', () => {
    state.filters = { query: '', owner: 'all', priority: 'all' };
    persistPreferences();
    el('kanban-search').value = '';
    el('kanban-owner').value = 'all';
    el('kanban-priority').value = 'all';
    renderKanban();
  });
  el('compact-toggle').addEventListener('change', (event) => {
    state.compact = event.target.checked;
    document.body.classList.toggle('compact', state.compact);
    persistPreferences();
  });
  el('close-modal').addEventListener('click', closeCardModal);
  if (!VIEW_ONLY) {
    el('card-form')?.addEventListener('submit', handleCardSubmit);
    el('delete-card')?.addEventListener('click', deleteCard);
  }
  el('card-modal').addEventListener('click', (event) => {
    if (event.target.id === 'card-modal') closeCardModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.modal.open) closeCardModal();
  });

  el('compact-toggle').checked = state.compact;
  el('kanban-search').value = state.filters.query;
  el('kanban-priority').value = state.filters.priority;

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => updateNav(btn.dataset.route));
  });

  el('auth-form').addEventListener('submit', sendOTP);
  el('otp-form').addEventListener('submit', verifyOTP);
  el('sign-out-btn').addEventListener('click', signOut);

  el('cron-refresh').addEventListener('click', loadCronJobs);
  if (!VIEW_ONLY) {
    el('cron-new')?.addEventListener('click', openCronCreate);
  }
  el('cron-search').addEventListener('input', (event) => {
    state.cronFilter = event.target.value;
    renderCronList();
  });

  if (VIEW_ONLY) {
    applyViewOnlyUI();
  }

  updateNav(state.activeRoute);
  updateResponsiveState();

  renderUsageUnavailable();
  initAuth();
  
  if (state.activeRoute === 'system') {
    loadSystemStatus();
    loadSystemEvents();
  }
}

window.addEventListener('load', init);
window.addEventListener('resize', () => {
  if (state.usage) {
    renderUsage();
  }
  updateResponsiveState();
});
