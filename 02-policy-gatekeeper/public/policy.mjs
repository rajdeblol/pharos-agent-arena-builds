/**
 * Policy Gatekeeper — deterministic preflight for a simulated action executor.
 * A caller should invoke its executor only after an `allow` result.
 */
export const policy = Object.freeze({
  spendLimit: 250,
  dailySpendCap: 500,
  allowedDestinations: ['0x71c7656ec7ab88b098defb751b7401b5f6d8976f', '0x9f2a6d31c08b4e57a1d3906c6b277e58f2d104ab'],
  window: { start: '09:00', end: '17:00', timezone: 'UTC', weekdaysOnly: true }
});

const normalized = value => String(value ?? '').trim().toLowerCase();
const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function validatePolicy(config) {
  const issues = [];
  if (!config || typeof config !== 'object') return ['Policy must be an object.'];
  if (!Number.isFinite(config.spendLimit) || config.spendLimit <= 0) issues.push('spendLimit must be a positive number.');
  if (!Number.isFinite(config.dailySpendCap) || config.dailySpendCap <= 0) issues.push('dailySpendCap must be a positive number.');
  if (!Array.isArray(config.allowedDestinations) || config.allowedDestinations.length === 0 || config.allowedDestinations.some(value => typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))) {
    issues.push('allowedDestinations must contain one or more 20-byte hex addresses.');
  }
  const window = config.window;
  if (!window || !validTime(window.start) || !validTime(window.end)) issues.push('window.start and window.end must use HH:MM 24-hour time.');
  if (!window || typeof window.timezone !== 'string' || !window.timezone.trim()) issues.push('window.timezone is required.');
  else {
    try { new Intl.DateTimeFormat('en', { timeZone: window.timezone }); }
    catch { issues.push('window.timezone is not recognized.'); }
  }
  if (window && typeof window.weekdaysOnly !== 'boolean') issues.push('window.weekdaysOnly must be a boolean.');
  return issues;
}

export function evaluateAction(action, config = policy) {
  if (!config || typeof config !== 'object') config = {};
  const configIssues = validatePolicy(config);
  const amount = Number(action?.amount);
  const asset = action?.asset || 'USD';
  const amountValid = Number.isFinite(amount) && amount > 0;
  const previousDailySpend = Number(action?.dailySpendBefore ?? 0);
  const amountCents = Math.round(amount * 100);
  const spendCapPass = amountValid && amountCents <= Math.round(config.spendLimit * 100);
  const totalDailyCents = Math.round(previousDailySpend * 100) + amountCents;
  const dailySpendPass = amountValid && Number.isFinite(previousDailySpend) && previousDailySpend >= 0 && totalDailyCents <= Math.round(config.dailySpendCap * 100);
  const destinationAllowed = Array.isArray(config.allowedDestinations) && config.allowedDestinations.map(normalized).includes(normalized(action?.destination));
  const { start, end, timezone, weekdaysOnly } = config.window || {};
  let timeAllowed = false;
  let timeReason;
  if (!configIssues.length) {
    try {
      const date = new Date(action?.at || Date.now());
      if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
      const part = key => parts.find(item => item.type === key)?.value;
      const now = `${part('hour')}:${part('minute')}`;
      const weekday = part('weekday');
      const withinHours = start <= end ? now >= start && now < end : now >= start || now < end;
      timeAllowed = withinHours && !(weekdaysOnly && ['Sat', 'Sun'].includes(weekday));
      timeReason = timeAllowed ? `Inside ${start}–${end} ${timezone}.` : `Outside ${start}–${end} ${timezone}${weekdaysOnly ? ' weekday' : ''} window.`;
    } catch { timeReason = 'Request time or time zone is invalid.'; }
  } else timeReason = `Policy configuration is invalid: ${configIssues.join(' ')}`;

  const checks = [
    { rule: 'spend limit', label: 'Spend cap', passed: !configIssues.length && spendCapPass, reason: configIssues.length ? 'Blocked because policy configuration is invalid.' : !amountValid ? 'Amount must be positive.' : spendCapPass ? `Within ${config.spendLimit} ${asset} cap.` : `${amount} ${asset} exceeds the ${config.spendLimit} ${asset} cap.` },
    { rule: 'daily spend cap', label: 'Daily cap', passed: !configIssues.length && dailySpendPass, reason: configIssues.length ? 'Blocked because policy configuration is invalid.' : !Number.isFinite(previousDailySpend) || previousDailySpend < 0 ? 'Prior daily spend must be a non-negative number.' : dailySpendPass ? `${(totalDailyCents / 100).toFixed(2)} of ${config.dailySpendCap} ${asset} daily cap.` : `This request would bring daily spend to ${(totalDailyCents / 100).toFixed(2)} ${asset}, above the ${config.dailySpendCap} ${asset} cap.` },
    { rule: 'destination allowlist', label: 'Allowlist', passed: !configIssues.length && destinationAllowed, reason: configIssues.length ? 'Blocked because policy configuration is invalid.' : destinationAllowed ? 'Destination is approved (case-insensitive match).' : 'Destination is not on the approved address list.' },
    { rule: 'time window', label: 'Time window', passed: !configIssues.length && timeAllowed, reason: timeReason }
  ];
  const failed = checks.find(check => !check.passed);
  return failed
    ? { decision: 'deny', rule: configIssues.length ? 'invalid policy config' : failed.rule, reason: configIssues.length ? configIssues.join(' ') : failed.reason, checks, configIssues }
    : { decision: 'allow', rule: 'all checks passed', reason: 'Amount, daily total, destination, and time window all passed.', checks, configIssues: [] };
}

/** Gate an executor so denied requests cannot reach it. */
export async function runGuarded(action, executor, config = policy) {
  const result = evaluateAction(action, config);
  if (result.decision === 'deny') return { ...result, executed: false };
  const output = await executor(action);
  return { ...result, executed: true, output };
}
