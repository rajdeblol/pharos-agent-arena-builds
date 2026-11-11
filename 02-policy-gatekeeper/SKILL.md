---
name: policy-gatekeeper
description: Evaluate an agent action against spend, destination, and time-window policy before calling any executor.
---

# Policy Gatekeeper

Use this skill as a preflight for any action that could move value or change on-chain state. Policy is fail-closed: if the request is malformed or any required check fails, return `deny` and do not call a transaction, contract-write, or other action tool.

## Policy

The policy is implemented in `public/policy.mjs` and re-exported from the repo root `policy.mjs`:

- Maximum 250 USD per action.
- Only the two explicitly listed destination addresses.
- Monday through Friday, 09:00 inclusive to 17:00 exclusive, UTC.

## Decision flow

1. Normalize and validate the amount.
2. Check the spend cap.
3. Check the destination allowlist (case-insensitive address comparison).
4. Check the configured time window even if an earlier rule failed.
5. Return all three pass/fail outcomes in a rule trace. Return `allow` only when every check passes; name the first failed rule as the deciding reason otherwise.
6. Append every decision and its rule trace to the audit log.
7. Call the downstream executor only for `allow`. Never retry or route around a deny decision.

Use `evaluateAction(action, config)` for a decision and `runGuarded(action, executor, config)` when wiring an executor. `runGuarded` does not invoke the executor for denied requests. The included web demo's executor is deliberately simulation-only. Before using this skill with any real transaction tool, bind the executor to the exact approved action and keep human signing in the wallet.

## Required audit fields

Record timestamp, requested amount and asset, destination, decision, deciding rule, reason, and whether the executor ran. The demo stores its ledger in browser local storage and labels simulated execution explicitly.
