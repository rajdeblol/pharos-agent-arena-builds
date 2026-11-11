import { evaluateAction, runGuarded, policy } from './policy.mjs';

const $ = id => document.getElementById(id);
const form = $('request-form'), amountInput = $('amount'), destinationInput = $('destination');
const decisionBox = $('decision'), ledgerBody = $('ledger');
const allowed = policy.allowedDestinations;
const scenarios = {
  allow: { amount: 84, destination: allowed[0], at: '2026-11-11T12:30:00Z' },
  spend: { amount: 420, destination: allowed[0], at: '2026-11-11T12:30:00Z' },
  address: { amount: 84, destination: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', at: '2026-11-11T12:30:00Z' },
  time: { amount: 84, destination: allowed[0], at: '2026-11-11T22:15:00Z' }
};
const names = { allow: 'Within policy', spend: 'Over the cap', address: 'Unknown address', time: 'Outside hours' };
const addressLabel = address => `${address.slice(0, 6)}…${address.slice(-4)}`;
let log = JSON.parse(localStorage.getItem('gatekeeper-ledger') || 'null');
if (!Array.isArray(log)) log = [
  { at: '2026-11-11T12:31:04Z', amount: 84, destination: allowed[0], result: 'allow', rule: 'all checks passed', executed: true },
  { at: '2026-11-11T12:31:28Z', amount: 420, destination: allowed[0], result: 'deny', rule: 'spend limit', executed: false },
  { at: '2026-11-11T12:32:10Z', amount: 84, destination: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', result: 'deny', rule: 'destination allowlist', executed: false },
  { at: '2026-11-11T22:15:00Z', amount: 84, destination: allowed[0], result: 'deny', rule: 'time window', executed: false }
];

function renderLedger() {
  $('ledger-count').textContent = `${String(log.length).padStart(2, '0')} ENTRIES`;
  $('empty-ledger').hidden = log.length !== 0;
  ledgerBody.innerHTML = log.map(row => {
    const date = new Date(row.at);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date);
    return `<tr><td>${time} UTC</td><td>${Number(row.amount).toLocaleString('en-US')} USD</td><td>${addressLabel(row.destination)}</td><td><span class="badge ${row.result}">${row.result.toUpperCase()}</span></td><td>${row.rule}</td><td class="${row.executed ? 'executor-yes' : 'executor-no'}">${row.executed ? 'SIMULATED' : 'NOT RUN'}</td></tr>`;
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
  const result = await runGuarded(action, async () => ({ simulated: true, reference: `SIM-${Date.now().toString(36).toUpperCase()}` }));
  showDecision(result);
  persistAndRender({ at: new Date().toISOString(), amount: action.amount, destination: action.destination, result: result.decision, rule: result.rule, executed: result.executed });
});
document.querySelectorAll('.scenario').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.scenario').forEach(item => item.classList.toggle('active', item === button));
  const sample = scenarios[button.dataset.scenario];
  amountInput.value = sample.amount;
  destinationInput.value = sample.destination;
  showDecision({ ...evaluateAction({ ...sample, asset: 'USD' }), decision: sample === scenarios.allow ? 'allow' : evaluateAction({ ...sample, asset: 'USD' }).decision });
}));
$('clear-log').addEventListener('click', () => { log = []; localStorage.setItem('gatekeeper-ledger', '[]'); renderLedger(); });
renderLedger();
