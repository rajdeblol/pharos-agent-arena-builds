/**
 * Policy Gatekeeper — deterministic preflight for an action executor.
 * A caller should invoke its executor only after an `allow` result.
 */
export const policy = Object.freeze({
  spendLimit: 250,
  allowedDestinations: ['0x71c7656ec7ab88b098defb751b7401b5f6d8976f', '0x9f2a6d31c08b4e57a1d3906c6b277e58f2d104ab'],
  window: { start: '09:00', end: '17:00', timezone: 'UTC', weekdaysOnly: true }
});

const normalized = value => String(value ?? '').trim().toLowerCase();
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function evaluateAction(action, config = policy) {
  const amount = Number(action.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { decision: 'deny', rule: 'valid amount', reason: 'Amount must be a positive number.' };
  if (amount > config.spendLimit) return { decision: 'deny', rule: 'spend limit', reason: `${amount} ${action.asset || 'USD'} exceeds the ${config.spendLimit} ${action.asset || 'USD'} per-action cap.` };
  if (!config.allowedDestinations.map(normalized).includes(normalized(action.destination))) return { decision: 'deny', rule: 'destination allowlist', reason: 'Destination is not on the approved address list.' };
  const { start, end, timezone, weekdaysOnly } = config.window;
  if (!validTime(start) || !validTime(end) || !timezone) return { decision: 'deny', rule: 'policy configuration', reason: 'Time window configuration is invalid.' };
  const date = new Date(action.at || Date.now());
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = key => parts.find(item => item.type === key)?.value;
  const now = `${part('hour')}:${part('minute')}`;
  const weekday = part('weekday');
  const withinHours = start <= end ? now >= start && now < end : now >= start || now < end;
  if (!withinHours || (weekdaysOnly && ['Sat', 'Sun'].includes(weekday))) return { decision: 'deny', rule: 'time window', reason: `Outside the ${start}–${end} ${timezone}${weekdaysOnly ? ' weekday' : ''} window.` };
  return { decision: 'allow', rule: 'all checks passed', reason: `Within cap, destination is approved, and request is inside the ${start}–${end} ${timezone} window.` };
}

/** Gate an executor so denied requests cannot reach it. */
export async function runGuarded(action, executor, config = policy) {
  const result = evaluateAction(action, config);
  if (result.decision === 'deny') return { ...result, executed: false };
  const output = await executor(action);
  return { ...result, executed: true, output };
}
