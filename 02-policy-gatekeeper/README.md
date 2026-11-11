# Policy Gatekeeper

A small policy checkpoint for the Pharos SkillEngine task. It checks each requested action against a spend ceiling, destination allowlist, and UTC weekday window. Every rule runs on every request and the UI keeps a pass/fail trace; the first failed check decides the deny reason. `runGuarded` never invokes the executor for a denied request. Each decision and its rule trace are recorded in a browser-local ledger.

## Run locally

Requires Node.js 20 or newer.

```sh
npm start
```

Open `http://localhost:4174`. There are four scenarios: one allow and one deny for each required rule type. Adjust the amount and address, then evaluate a request. The executor in this demo only returns a simulated reference. It does not connect a wallet, sign, or submit transactions.

## Policy choices

`public/policy.mjs` is the source of truth: per-action limit of 250 USD, two destination addresses, and 09:00–17:00 UTC on weekdays. The repo-root `policy.mjs` re-exports the same module. `evaluateAction` is deterministic apart from the supplied/current time. Callers that need execution should use `runGuarded(action, executor, config)` so denied requests do not reach the executor.

The ledger is stored in the current browser's local storage, with a clear control. Example rows are seeded on first open so all three deny paths and the allow path are immediately reviewable. No private key, wallet, or RPC is used.

## Files

- `public/policy.mjs` — policy evaluator and guarded executor, included in the deployed static output.
- `policy.mjs` — root re-export for Node consumers.
- `public/` — working demo and decision ledger.
- `server.mjs` — static Node server suitable for local use or a Node host.

## References

- [Arena task brief](https://pharos-agent-arena.vercel.app/tasks/policy-gatekeeper)
- [Pharos Skill Engine](https://ai.pharos.xyz/skill-engine)
- [Skill Engine source](https://github.com/PharosNetwork/pharos-skill-engine)
