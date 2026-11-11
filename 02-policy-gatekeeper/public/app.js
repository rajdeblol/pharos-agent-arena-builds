import { evaluateAction, runGuarded, policy, validatePolicy } from './policy.mjs';

const $ = id => document.getElementById(id);
const form = $('request-form'), amountInput = $('amount'), destinationInput = $('destination');
const decisionBox = $('decision'), ledgerBody = $('ledger');
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const utcDay = at => new Date(at).toISOString().slice(0, 10);
let activePolicy = readJSON('gatekeeper-policy', policy);
if (validatePolicy(activePolicy).length) activePolicy = structuredClone(policy);
let log = readJSON('gatekeeper-ledger', null);
if (!Array.isArray(log)) log = [
  { at: '2026-11-11T12:31:04Z', amount: 84, destination: policy.allowedDestinations[0], result: 'allow', rule: 'all checks passed', executed: true },
  { at: '2026-11-11T12:31:28Z', amount: 420, destination: policy.allowedDestinations[0], result: 'deny', rule: 'spend limit', executed: false },
  { at: '2026-11-11T12:32:10Z', amount: 84, destination: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', result: 'deny', rule: 'destination allowlist', executed: false },
  { at: '2026-11-11T22:15:00Z', amount: 84, destination: policy.allowedDestinations[0], result: 'deny', rule: 'time window', executed: false }
];
const dailyTotals = new Map();
[...log].sort((a, b) => new Date(a.at) - new Date(b.at)).forEach(row => {
  const day = utcDay(row.at);
  const before = dailyTotals.get(day) || 0;
  if (!row.checks) row.checks = evaluateAction({ amount: row.amount, asset: 'USD', destination: row.destination, at: row.at, dailySpendBefore: before }, activePolicy).checks;
  if (row.result === 'allow' && row.executed) dailyTotals.set(day, before + Math.round(Number(row.amount) * 100) / 100);
});
const scenarios = {
  allow: { amount: 84, destination: policy.allowedDestinations[0], at: '2026-11-11T12:30:00Z' },
  spend: { amount: 420, destination: policy.allowedDestinations[0], at: '2026-11-11T12:30:00Z' },
  address: { amount: 84, destination: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', at: '2026-11-11T12:30:00Z' },
  time: { amount: 84, destination: policy.allowedDestinations[0], at: '2026-11-11T22:15:00Z' }
};
const addressLabel = address => `${String(address).slice(0, 6)}…${String(address).slice(-4)}`;
function dailySpendBefore(at) {
  const day = utcDay(at);
  const cents = log.reduce((sum, row) => row.result === 'allow' && row.executed && utcDay(row.at) === day ? sum + Math.round(Number(row.amount) * 100) : sum, 0);
  return cents / 100;
}
function refreshPolicyView() {
  $('cap-value').textContent = activePolicy.spendLimit;
  $('daily-cap-value').textContent = activePolicy.dailySpendCap;
  $('allow-count').textContent = activePolicy.allowedDestinations.length;
  $('window-value').textContent = `${activePolicy.window.start}–${activePolicy.window.end}`;
  $('window-zone').textContent = `${activePolicy.window.timezone} · ${activePolicy.window.weekdaysOnly ? 'weekdays' : 'all days'}`;
  $('policy-json').value = JSON.stringify(activePolicy, null, 2);
  destinationInput.innerHTML = activePolicy.allowedDestinations.map(address => `<option value="${address}">${addressLabel(address)} · approved</option>`).join('') + '<option value="0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef">0xdead…beef · not approved</option>';
}
function renderLedger() {
  $('ledger-count').textContent = `${String(log.length).padStart(2, '0')} ENTRIES`;
  $('empty-ledger').hidden = log.length !== 0;
  ledgerBody.innerHTML = log.map(row => {
    const date = new Date(row.at);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date);
    const trace = (row.checks || []).map(check => `<span class="ledger-check ${check.passed ? 'passed' : 'failed'}">${check.label}: ${check.passed ? 'pass' : 'stop'}</span>`).join(' ');
    return `<tr><td>${time} UTC</td><td>${Number(row.amount).toLocaleString('en-US')} USD</td><td>${addressLabel(row.destination)}</td><td><span class="badge ${row.result}">${row.result.toUpperCase()}</span></td><td>${row.rule}</td><td>${trace || '—'}</td><td class="${row.executed ? 'executor-yes' : 'executor-no'}">${row.executed ? 'SIMULATED' : 'NOT RUN'}</td></tr>`;
  }).join('');
}
function showDecision(result) {
  const denied = result.decision === 'deny';
  decisionBox.classList.toggle('deny', denied);
  decisionBox.classList.toggle('allow', !denied);
  decisionBox.querySelector('.decision-icon').textContent = denied ? '×' : '✓';
  decisionBox.querySelector('.decision-word').textContent = result.decision.toUpperCase();
  decisionBox.querySelector('.decision-rule').textContent = result.rule.toUpperCase();
  $('decision-reason').textContent = result.reason;
  $('rule-trace').innerHTML = (result.checks || []).map(check => `<div class="trace-row ${check.passed ? 'passed' : 'failed'}"><span class="trace-mark">${check.passed ? '✓' : '×'}</span><span class="trace-name">${check.label}</span><span class="trace-reason">${check.reason}</span></div>`).join('');
  $('execution').innerHTML = denied
    ? '<span class="exec-led"></span><span>SIMULATED ACTION</span><b>blocked · executor not called</b>'
    : '<span class="exec-led"></span><span>SIMULATED ACTION</span><b>passed to demo executor</b>';
}
function persistAndRender(entry) {
  log.unshift(entry); log = log.slice(0, 30);
  localStorage.setItem('gatekeeper-ledger', JSON.stringify(log)); renderLedger();
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  document.querySelectorAll('.scenario').forEach(button => button.classList.remove('active'));
  const action = { amount: Number(amountInput.value), asset: 'USD', destination: destinationInput.value, at: new Date().toISOString() };
  action.dailySpendBefore = dailySpendBefore(action.at);
  const result = await runGuarded(action, async () => ({ simulated: true, reference: `SIM-${Date.now().toString(36).toUpperCase()}` }), activePolicy);
  showDecision(result);
  persistAndRender({ at: action.at, amount: action.amount, destination: action.destination, result: result.decision, rule: result.rule, checks: result.checks, executed: result.executed });
});
document.querySelectorAll('.scenario').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.scenario').forEach(item => item.classList.toggle('active', item === button));
  const sample = { ...scenarios[button.dataset.scenario], asset: 'USD' };
  sample.dailySpendBefore = dailySpendBefore(sample.at);
  amountInput.value = sample.amount;
  if (activePolicy.allowedDestinations.includes(sample.destination)) destinationInput.value = sample.destination;
  showDecision(evaluateAction(sample, activePolicy));
}));
$('save-policy').addEventListener('click', () => {
  try {
    const candidate = JSON.parse($('policy-json').value);
    const issues = validatePolicy(candidate);
    if (issues.length) throw new Error(issues.join(' '));
    activePolicy = candidate;
    localStorage.setItem('gatekeeper-policy', JSON.stringify(activePolicy));
    refreshPolicyView();
    $('policy-message').textContent = 'Config applied and saved in this browser.';
  } catch (error) { $('policy-message').textContent = `Not applied: ${error.message}`; }
});
$('reset-policy').addEventListener('click', () => {
  activePolicy = structuredClone(policy);
  localStorage.removeItem('gatekeeper-policy');
  refreshPolicyView();
  $('policy-message').textContent = 'Default config restored.';
});
$('clear-log').addEventListener('click', () => { log = []; localStorage.setItem('gatekeeper-ledger', '[]'); renderLedger(); });
refreshPolicyView();
renderLedger();
