'use strict';
const $ = (selector) => document.querySelector(selector);
let selected = null;
let config = null;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const finalStates = ['COMPLETED', 'RECOVERED', 'ERROR'];

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) }, signal: AbortSignal.timeout(120000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function busy(on, label = 'RUNNING') {
  $('#run').disabled = on;
  $('#resume').disabled = on || !selected || finalStates.includes(selected.state);
  $('#scenario').disabled = on;
  $('#amount').disabled = on;
  $('#connection').textContent = label;
  $('#connection').dataset.state = on ? 'live' : label === 'ERROR' ? 'error' : 'idle';
}
function txLink(hash) {
  return hash ? `<a href="${esc(config.explorer)}/tx/${esc(hash)}" target="_blank" rel="noopener noreferrer">${esc(hash)} ↗</a>` : '<span class="muted">No transaction hash</span>';
}
function snapshot(title, value) {
  if (!value) return '';
  return `<section class="balance"><h3>${esc(title)}</h3><dl><div><dt>Owner balance</dt><dd>${esc(value.ownerBalance)} ${esc(value.symbol)}</dd></div><div><dt>Owner → escrow allowance</dt><dd>${esc(value.allowance)} ${esc(value.symbol)}</dd></div><div><dt>Escrow → vault allowance</dt><dd>${esc(value.vaultAllowance ?? '—')} ${esc(value.symbol)}</dd></div><div><dt>Tokens in escrow</dt><dd>${esc(value.escrowBalance ?? '—')} ${esc(value.symbol)}</dd></div><div><dt>Vault credit</dt><dd>${esc(value.vaultCredit)} ${esc(value.symbol)}</dd></div><div><dt>Escrow status</dt><dd>${esc(value.escrow.status)}</dd></div></dl></section>`;
}
function logRow(item) {
  return `<article class="step log-row"><time>#${esc(item.sequence ?? '—')} · ${esc(item.timestamp)}</time><b>${esc(item.state)} · ${esc(item.event)}</b><p>${esc(JSON.stringify(item.details || {}))}</p></article>`;
}
function txRow([name, value]) {
  const receipt = value.receipt || {};
  const failed = value.outcome === 'EXPECTED_REVERT' || value.outcome === 'REVERTED';
  const title = value.outcome === 'EXPECTED_REVERT' ? 'EXPECTED REVERT' : (value.outcome || 'PENDING').replaceAll('_', ' ');
  return `<article class="tx-card"><div class="tx-top"><b>${esc(name.replaceAll(/([A-Z])/g, ' $1').toUpperCase())}</b><span class="${failed ? 'outcome-bad' : 'outcome-ok'}">${esc(title)}</span></div>${txLink(value.hash)}<div class="tx-meta"><span>Attempt ${esc(value.attempts ?? 0)}</span><span>Receipt ${esc(receipt.status ?? 'pending')} · block ${esc(receipt.blockNumber ?? 'pending')}</span></div></article>`;
}
function errorRow(item) {
  return `<article class="step error-row"><time>${esc(item.timestamp)}</time><b>ERROR · ${esc(item.classification || item.phase || 'UNCLASSIFIED')}</b><p>${esc(item.message)}${item.pendingHash ? ` · pending ${txLink(item.pendingHash)}` : ''}</p></article>`;
}
function renderSaga(saga) {
  selected = saga;
  $('#saga-id').textContent = saga.id;
  $('#state').textContent = saga.state.replaceAll('_', ' ');
  $('#state-title').textContent = saga.state.replaceAll('_', ' ');
  const good = ['COMPLETED', 'RECOVERED'].includes(saga.state);
  const bad = ['ERROR', 'RECOVERY_REQUIRED'].includes(saga.state);
  const message = saga.state === 'COMPLETED'
    ? 'All three steps passed their receipt and state checks.'
    : saga.state === 'RECOVERED'
      ? (saga.mode === 'failure-broadcast' ? 'The failed deposit receipt was verified; escrow was refunded and approval cleared.' : 'The deposit was refused before broadcast; escrow was refunded and approval cleared.')
      : bad ? 'The saga needs attention. Open the state log or resume recovery.' : 'The saga is saved and can be safely resumed.';
  $('#summary').classList.toggle('failed', bad);
  $('#summary').innerHTML = `<span class="result-mark">${good ? '✓' : bad ? '!' : '•'}</span><p>${esc(message)}</p>`;
  const logs = saga.logs?.length ? saga.logs : (saga.timeline || []);
  const transactions = Object.entries(saga.transactions || {});
  const errors = saga.errors || [];
  $('#transactions').innerHTML = transactions.length ? transactions.map(txRow).join('') : '<div class="empty">No transaction has been sent yet.</div>';
  $('#steps').innerHTML = `<div class="section-label">${esc(logs.length)} state events</div>${logs.map(logRow).join('')}${errors.length ? `<div class="section-label error-label">Recorded errors</div>${errors.map(errorRow).join('')}` : ''}`;
  $('#balances').innerHTML = snapshot('Before', saga.observations?.before) + snapshot('After', saga.observations?.after);
  $('#resume').disabled = good || finalStates.includes(saga.state);
  $('#state-title').dataset.state = good ? 'success' : bad ? 'error' : 'pending';
}
function renderRetryEvidence(evidence) {
  const attempts = evidence.attempts || [];
  $('#retry-evidence').innerHTML = `<div><b>${esc(evidence.label)}</b><span>${attempts.map((item) => `#${item.attempt} +${item.delayMs}ms ${item.classification}`).join(' · ')}</span></div><div><b>${esc(evidence.outcome)}</b><span>Two injected timeouts; success on attempt three.</span></div><div><b>${esc(evidence.reconciliation?.outcome)}</b><span>Duplicate state-changing operations: ${esc(evidence.reconciliation?.duplicateStateChangingOperations)}</span></div>`;
}
async function openSaga(id) {
  const data = await request(`/saga-api/sagas/${encodeURIComponent(id)}`);
  renderSaga(data.saga);
  return data.saga;
}
async function loadHistory() {
  try {
    const data = await request('/saga-api/sagas');
    const rows = data.sagas || [];
    $('#history').innerHTML = rows.length ? rows.map((saga) => `<div class="history-row"><b>${esc(saga.id)}</b><span>${esc(saga.mode.toUpperCase())}</span><span>${esc(saga.state)}</span><button data-id="${esc(saga.id)}" type="button">View</button></div>`).join('') : '<div class="empty">No saved runs yet.</div>';
    $('#history').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => openSaga(button.dataset.id).then(() => { $('.technical').open = true; }).catch((error) => { $('#state-title').textContent = 'Could not load this run'; $('#summary').innerHTML = `<span class="result-mark">!</span><p>${esc(error.message)}</p>`; })));
  } catch (error) {
    $('#history').innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}
async function finish(data) {
  renderSaga(data.saga);
  let guard = 0;
  while (!finalStates.includes(data.saga.state) && data.saga.state !== 'RECOVERY_REQUIRED' && guard++ < 8) {
    data = await request(`/saga-api/sagas/${encodeURIComponent(data.saga.id)}/resume`, { method: 'POST' });
    renderSaga(data.saga);
  }
  return data;
}
async function run() {
  busy(true, 'RUNNING');
  $('#state').textContent = 'RUNNING';
  $('#state-title').textContent = 'Saga running…';
  $('#summary').classList.remove('failed');
  $('#summary').innerHTML = '<span class="result-mark">…</span><p>Waiting for confirmed receipts. This can take a little while.</p>';
  $('#transactions').innerHTML = '<div class="empty">Checking each step on Atlantic…</div>';
  try {
    let data = await request('/saga-api/sagas', { method: 'POST', body: JSON.stringify({ mode: $('#scenario').value, amount: $('#amount').value.trim() }) });
    data = await finish(data);
    await loadHistory();
    await openSaga(data.saga.id);
    const success = ['COMPLETED', 'RECOVERED'].includes(data.saga.state);
    $('#connection').textContent = success ? 'CONNECTED' : 'ATTENTION';
    $('#connection').dataset.state = success ? 'live' : 'error';
  } catch (error) {
    $('#connection').textContent = 'ERROR';
    $('#connection').dataset.state = 'error';
    $('#state-title').textContent = 'Run stopped';
    $('#summary').classList.add('failed');
    $('#summary').innerHTML = `<span class="result-mark">!</span><p>${esc(error.message)}</p>`;
  } finally {
    $('#run').disabled = false;
    $('#scenario').disabled = false;
    $('#amount').disabled = false;
  }
}
async function resume() {
  if (!selected) return;
  busy(true, 'RECOVERING');
  try {
    let data = await request(`/saga-api/sagas/${encodeURIComponent(selected.id)}/resume`, { method: 'POST' });
    data = await finish(data);
    await loadHistory();
    await openSaga(data.saga.id);
  } catch (error) {
    $('#summary').classList.add('failed');
    $('#summary').innerHTML = `<span class="result-mark">!</span><p>${esc(error.message)}</p>`;
  } finally {
    busy(false, 'CONNECTED');
  }
}
function updateScenario() {
  const failure = $('#scenario').value === 'failure';
  const broadcast = $('#scenario').value === 'failure-broadcast';
  $('#amount').max = broadcast ? '1' : '10';
  $('#scenario-help').textContent = failure
    ? 'The vault rejects the deposit during preflight. The agent refunds escrow and clears approval.'
    : broadcast
      ? 'A controlled deposit is mined with status 0x0, then the agent refunds escrow and clears approval. Maximum 1 SGT.'
      : 'Approves SGT, locks it in escrow, then deposits it into the test vault.';
}
async function init() {
  $('#scenario').addEventListener('change', updateScenario);
  $('#run').addEventListener('click', run);
  $('#resume').addEventListener('click', resume);
  $('#refresh').addEventListener('click', loadHistory);
  try {
    const [configuration, evidence] = await Promise.all([request('/saga-api/config'), request('/saga-executor/retry-simulation.json')]);
    config = configuration;
    renderRetryEvidence(evidence);
    $('#block').textContent = config.latestBlock;
    $('#owner').textContent = `${config.owner.slice(0, 8)}…${config.owner.slice(-6)}`;
    $('#owner').title = config.owner;
    $('#mcp-status').textContent = `MCP ready · ${config.mcp.tools.length} tools`;
    $('#connection').textContent = 'CONNECTED';
    $('#connection').dataset.state = 'live';
    updateScenario();
    await loadHistory();
  } catch (error) {
    $('#connection').textContent = 'UNAVAILABLE';
    $('#connection').dataset.state = 'error';
    $('#state-title').textContent = 'Demo unavailable';
    $('#summary').classList.add('failed');
    $('#summary').innerHTML = `<span class="result-mark">!</span><p>${esc(error.message)}</p>`;
  }
}
init();
