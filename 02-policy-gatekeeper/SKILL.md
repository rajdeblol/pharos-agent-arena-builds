---
name: policy-gatekeeper
description: Evaluate an agent action against per-action and per-day spend, destination, and time-window policy before calling any executor.
---

# Policy Gatekeeper

Use this skill as a preflight for an action that could move value or change on-chain state. Policy is fail-closed: malformed policy or any failed check returns `deny`, and the executor must not run.

## Default policy

Implemented in `public/policy.mjs` and re-exported from root `policy.mjs`:

- Maximum 250 USD per action.
- Maximum 500 USD per UTC calendar day.
- Only the explicitly listed destination addresses (case-insensitive comparison).
- Monday through Friday, 09:00 inclusive to 17:00 exclusive, UTC by default.

## Decision flow

1. Validate the policy configuration and request amount.
2. Check the per-action cap and the UTC-day total (`dailySpendBefore` + requested amount).
3. Check the destination allowlist.
4. Check the configured time window, even if an earlier rule failed.
5. Return all four pass/fail outcomes. Allow only when all pass; otherwise identify the first failed rule.
6. Record the decision and trace.
7. Call the downstream executor only for `allow`. Never retry or route around a deny.

Use `evaluateAction(action, config)` for a decision and `runGuarded(action, executor, config)` to gate an executor. The caller must supply an authoritative `dailySpendBefore`; the demo obtains an illustrative value from local browser storage. That value is not trusted or suitable for production enforcement. The demo executor is simulation-only. A real integration must enforce policy server-side, bind the executor to the exact approved action, and retain human signing in the wallet.

## Audit fields

Record timestamp, requested amount and asset, destination, decision, deciding rule, reason, all rule outcomes, and whether the executor ran. Demo ledger data and editable policy are held in local storage and can be modified by the browser owner.
