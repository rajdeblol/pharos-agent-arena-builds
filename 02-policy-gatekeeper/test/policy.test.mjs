import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAction, policy, runGuarded } from '../public/policy.mjs';

const address = policy.allowedDestinations[0];
const weekday = '2026-11-11T12:00:00.000Z'; // Wednesday
const request = overrides => ({ amount: 10, asset: 'USD', destination: address, at: weekday, ...overrides });

test('per-action cap accepts the exact limit and rejects one cent above', () => {
  assert.equal(evaluateAction(request({ amount: 250 })).decision, 'allow');
  const result = evaluateAction(request({ amount: 250.01 }));
  assert.equal(result.decision, 'deny');
  assert.equal(result.rule, 'spend limit');
});

test('daily cap counts prior approved spend and accepts exact remaining balance', () => {
  assert.equal(evaluateAction(request({ amount: 200, dailySpendBefore: 300 })).decision, 'allow');
  const result = evaluateAction(request({ amount: 200.01, dailySpendBefore: 300 }));
  assert.equal(result.decision, 'deny');
  assert.equal(result.rule, 'daily spend cap');
});

test('allowlist comparison accepts checksum casing but rejects a changed address', () => {
  assert.equal(evaluateAction(request({ destination: address.toUpperCase() })).decision, 'allow');
  assert.equal(evaluateAction(request({ destination: `${address.slice(0, -1)}0` })).rule, 'destination allowlist');
});

test('window includes its start and excludes its end', () => {
  assert.equal(evaluateAction(request({ at: '2026-11-11T09:00:00Z' })).decision, 'allow');
  assert.equal(evaluateAction(request({ at: '2026-11-11T16:59:00Z' })).decision, 'allow');
  assert.equal(evaluateAction(request({ at: '2026-11-11T17:00:00Z' })).rule, 'time window');
});

test('weekday-only policy denies weekend requests', () => {
  assert.equal(evaluateAction(request({ at: '2026-11-14T12:00:00Z' })).rule, 'time window');
});

test('timezone edges use local wall clock and weekday', () => {
  const pacific = { ...policy, window: { ...policy.window, timezone: 'America/Los_Angeles' } };
  assert.equal(evaluateAction(request({ at: '2026-11-11T17:00:00Z' }), pacific).decision, 'allow'); // 09:00 local
  assert.equal(evaluateAction(request({ at: '2026-11-12T01:00:00Z' }), pacific).rule, 'time window'); // 17:00 local
  assert.equal(evaluateAction(request({ at: '2026-11-14T20:00:00Z' }), pacific).rule, 'time window'); // Saturday local
});

test('invalid policy fails closed and reports all rules as stopped', () => {
  const invalid = { ...policy, spendLimit: 0, window: { ...policy.window, timezone: 'Mars/Olympus' } };
  const result = evaluateAction(request(), invalid);
  assert.equal(result.decision, 'deny');
  assert.equal(result.rule, 'invalid policy config');
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every(check => !check.passed));
});

test('combined failures retain every result while first failed rule decides', () => {
  const result = evaluateAction(request({ amount: 900, destination: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', at: '2026-11-11T20:00:00Z' }));
  assert.equal(result.rule, 'spend limit');
  assert.deepEqual(result.checks.map(check => check.passed), [false, false, false, false]);
});

test('denied request never calls executor; allowed request calls once', async () => {
  let calls = 0;
  const executor = async () => { calls += 1; return 'simulated'; };
  const denied = await runGuarded(request({ amount: 251 }), executor);
  assert.equal(denied.executed, false);
  assert.equal(calls, 0);
  const allowed = await runGuarded(request(), executor);
  assert.equal(allowed.executed, true);
  assert.equal(calls, 1);
});
