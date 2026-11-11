const DEFAULT_TOKEN = '0xc879c018db60520f4355c26ed1a6d572cdac1815';
const $ = (id) => document.getElementById(id);
const tokenInput = $('token');
const watchButton = $('watchButton');
const pauseButton = $('pauseButton');
let timer = null;
let watching = false;
let lastHead = null;
let events = new Map();

tokenInput.value = DEFAULT_TOKEN;

function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]').content = mode === 'dark' ? '#0b0b0b' : '#fff';
  $('themeToggle').textContent = mode === 'dark' ? 'WHITE' : 'DARK';
  $('themeToggle').setAttribute('aria-pressed', String(mode === 'dark'));
}
setTheme(localStorage.getItem('pharos-theme') === 'dark' ? 'dark' : 'light');
$('themeToggle').addEventListener('click', () => {
  const mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('pharos-theme', mode);
  setTheme(mode);
});

function status(text, state = '') {
  const el = $('feedStatus');
  el.className = `feed-status ${state}`;
  el.innerHTML = `<i></i> ${text}`;
}

function showMessage(title, detail, state = 'empty') {
  $('message').className = `message ${state}`;
  $('message').innerHTML = `<span class="empty-bars"><i></i><i></i><i></i></span><strong></strong><span></span>`;
  $('message').querySelector('strong').textContent = title;
  $('message').querySelector('span:last-child').textContent = detail;
  $('message').hidden = false;
  $('tableWrap').hidden = true;
}

function shortAddress(value) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function renderEvents(data) {
  for (const event of data.events) events.set(event.id, event);
  const rows = [...events.values()].sort((a, b) => b.block - a.block || b.logIndex - a.logIndex).slice(0, 100);
  $('feedTitle').textContent = `${data.symbol} · Transfer activity`;
  $('blockHeight').textContent = Number(data.head).toLocaleString('en-US');
  $('eventCount').textContent = Number(rows.length).toLocaleString('en-US');
  $('blockFrom').textContent = Number(data.from).toLocaleString('en-US');
  $('checkedAt').textContent = `Updated ${new Date(data.checkedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
  $('rangeLabel').textContent = `BLOCKS ${Number(data.from).toLocaleString()} — ${Number(data.head).toLocaleString()} · ${rows.length} SHOWN`;
  $('explorerLink').href = data.explorer;
  $('sourceLabel').textContent = data.via.toUpperCase();
  if (!rows.length) {
    $('message').hidden = false;
    $('message').className = 'message empty';
    $('message').innerHTML = '<span class="empty-bars"><i></i><i></i><i></i></span><strong>No Transfer events in this window</strong><span>Try a wider history window or another contract.</span>';
    $('tableWrap').hidden = true;
    return;
  }
  $('message').hidden = true;
  $('tableWrap').hidden = false;
  $('eventRows').innerHTML = rows.map((event) => `<article class="event-row"><div class="block-kind"><code>#${Number(event.block).toLocaleString()}</code><span class="kind-${event.kind.toLowerCase()}">${event.kind}</span></div><div class="parties"><code title="${escapeHtml(event.from)}">${shortAddress(event.from)}</code><em>→</em><code title="${escapeHtml(event.to)}">${shortAddress(event.to)}</code></div><div class="amount"><code>${escapeHtml(event.amount)} ${escapeHtml(event.symbol)}</code></div><div class="transaction"><a href="${escapeHtml(event.explorer)}" target="_blank" rel="noreferrer" title="${escapeHtml(event.tx)}">${shortAddress(event.tx)}</a></div></article>`).join('');
}

async function scan(initial = false) {
  const token = tokenInput.value.trim();
  const lookback = Number($('lookback').value);
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
    stop(false);
    status('CHECK ADDRESS', 'error');
    showMessage('That address needs a second look', 'Paste a 0x contract address with 40 hex characters.', 'error');
    return;
  }
  if (initial) {
    events = new Map();
    lastHead = null;
    watchButton.disabled = true;
    watchButton.querySelector('span').textContent = 'Scanning logs…';
    showMessage('Reading recent blocks', 'Connecting to Pharos Chain MCP.', 'loading');
  }
  status('SCANNING');
  try {
    const query = new URLSearchParams({ token, lookback: String(lookback) });
    if (!initial && lastHead !== null) query.set('since', String(lastHead));
    const response = await fetch(`/api/events?${query}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The Chain MCP request failed.');
    if (tokenInput.value.trim().toLowerCase() !== token.toLowerCase()) return;
    lastHead = data.head;
    renderEvents(data);
    status(watching ? 'LIVE · 8S' : 'UPDATED', 'live');
  } catch (error) {
    status('RPC ERROR', 'error');
    showMessage('Could not read the event logs', error instanceof Error ? error.message : 'Chain MCP is unavailable. Try again shortly.', 'error');
  } finally {
    if (initial) {
      watchButton.disabled = false;
      watchButton.querySelector('span').textContent = 'Start monitoring';
    }
  }
}

function stop(update = true) {
  if (timer) clearInterval(timer);
  timer = null;
  watching = false;
  pauseButton.textContent = 'PAUSE';
  pauseButton.disabled = true;
  if (update && lastHead !== null) status('PAUSED');
}

function start() {
  stop(false);
  watching = true;
  pauseButton.disabled = false;
  scan(true).then(() => {
    if (watching) timer = setInterval(() => scan(false), 8000);
  });
}

watchButton.addEventListener('click', start);
pauseButton.addEventListener('click', () => {
  if (!watching) return;
  stop();
});
$('usdcPreset').addEventListener('click', () => { tokenInput.value = DEFAULT_TOKEN; });
$('clearToken').addEventListener('click', () => { tokenInput.value = DEFAULT_TOKEN; });
tokenInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') start(); });
tokenInput.addEventListener('input', () => { if (watching) { stop(false); status('IDLE'); } });
$('lookback').addEventListener('change', () => { if (watching) start(); });
