# Policy Gatekeeper

**Live demo:** [pharos-policy-gatekeeper-five.vercel.app](https://pharos-policy-gatekeeper-five.vercel.app/)\
**Source:** [github.com/rajdeblol/pharos-policy-gatekeeper](https://github.com/rajdeblol/pharos-policy-gatekeeper)

A deterministic checkpoint between an agent request and its executor. Each request gets four checks: a per-action spend limit, a per-UTC-day spend cap, a destination allowlist, and a time window. The decision trace shows every check, even when an earlier check already failed. The first failing check is the reported reason. A denied request never reaches the executor.

The demo executor is a stub. It returns a simulated reference; it does not connect to a wallet, sign, or submit a transaction.

## 60-second walkthrough

1. Open the [live demo](https://pharos-policy-gatekeeper-five.vercel.app/). The initial panel shows the active policy and a sample decision ledger.
2. Choose **Over the cap**, **Unknown address**, or **Outside hours** to see a deny trace. Or keep **Within policy** and evaluate it.
3. Open **Edit policy config**, change a value in the JSON (for example `dailySpendCap`), and choose **Apply config**. The setting is saved in this browser. **Reset defaults** restores the shipped policy.
4. Submit a request. An allow is marked **SIMULATED**; a deny is marked **NOT RUN**. The UTC-day total counts only locally recorded allowed demo actions.

## Visual direction

The UI uses Pharos brand cues: Pharos Blue (`#0113B7`), black (`#0B0B0B`), light gray (`#DFE3E5`), white, and a Helvetica Neue sans-serif stack. PP Neue Montreal is listed first as the brand display face; systems without it fall back to Helvetica Neue/Arial. The wordmark stays text-based rather than copying the official logo. Reference: [Pharos official brand kit](https://www.pharos.xyz/brandkit).

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm test
npm start
```

Then open `http://localhost:4174`. The app has no runtime dependency on a wallet, RPC, or external API. The editable config and ledger are kept in browser local storage.

## Default policy and extension

The default policy lives in [`public/policy.mjs`](public/policy.mjs):

- Maximum **250 USD per request**.
- Maximum **500 USD per UTC calendar day**. The UI totals prior allowed demo actions for that UTC date and passes the amount into the evaluator as `dailySpendBefore`.
- Two explicitly listed 20-byte hex destinations. Comparison is case-insensitive.
- Monday–Friday, **09:00 inclusive to 17:00 exclusive**, in the configured timezone (UTC by default).

The policy JSON editor validates its values before applying them. `validatePolicy` checks positive numeric caps, address format, 24-hour times, timezone recognition, and the weekday flag. Invalid configuration fails closed. The root [`policy.mjs`](policy.mjs) re-exports the evaluator for Node consumers.

## Boundary cases

These expected results use the shipped defaults. Amounts are USD; time examples are Wednesday, 11 Nov 2026, UTC unless noted.

| Case | Expected result | Reason |
| --- | --- | --- |
| Request is exactly 250; no prior daily spend | Allow | Per-request cap is inclusive; total remains below 500. |
| Request is 250.01; no prior daily spend | Deny | Per-request cap exceeded by one cent. |
| Prior daily spend 300 + request 200 | Allow | Daily total equals the 500 cap. |
| Prior daily spend 300 + request 200.01 | Deny | Daily total exceeds the cap by one cent. |
| 09:00 UTC on a weekday | Allow | Window start is inclusive. |
| 16:59 UTC on a weekday | Allow | Still inside the window. |
| 17:00 UTC on a weekday | Deny | Window end is exclusive. |
| Saturday at 12:00 UTC | Deny | Default policy only permits weekdays. |
| Approved address with different letter casing | Allow | Addresses are normalized to lowercase for comparison. |
| Address with a changed hex character | Deny | It does not match an allowlisted destination. |
| Invalid timezone or zero/negative cap | Deny | Invalid policy configuration fails closed; all checks show stopped. |
| Overspend + unknown address + outside window | Deny | All checks run; the first failed rule (spend cap) supplies the decision reason. |

The comparison deliberately treats address case as insignificant; it does not validate EIP-55 checksum correctness. The date/time evaluator uses `Intl.DateTimeFormat` with the configured IANA timezone. Automated tests include a Los Angeles local-time boundary and weekend check.

## Tests

`npm test` runs Node's built-in test runner. Coverage includes each policy rule, exact and one-cent-over amounts, daily spend accumulation input, window start/end, weekend and timezone edges, case-insensitive addresses, malformed policy, multiple simultaneous failures, and the executor call count for allow and deny.

## Architecture decision

The gate accepts a plain action, a plain policy object, and an executor callback. `evaluateAction` is a side-effect-free decision function; `runGuarded` is the only helper that invokes the executor, and only on allow. The daily cap receives `dailySpendBefore` as an input instead of reading browser storage inside the policy module. This keeps policy evaluation testable and lets a production caller supply an authoritative spend total. In this demo, the browser ledger supplies that total for illustration only.

## AI assistance and ownership

AI assistance was used for the interface layout and styling, parts of the JavaScript implementation and copy, and iteration on the evaluator and its tests. The project owner supplied the task direction, chose the policy-gatekeeper scope, and requested the editable configuration, daily-cap extension, boundary coverage, and reviewer walkthrough. The shipped source and its limitations are documented here; this disclosure does not claim that AI-assisted code was written unaided by a person.

## Reviewer assets and limitations

- **Demo:** [live Vercel app](https://pharos-policy-gatekeeper-five.vercel.app/).
- **Repository:** [GitHub source](https://github.com/rajdeblol/pharos-policy-gatekeeper).
- **Walkthrough:** the four-step 60-second guide above.
- **Screenshot/video:** no separate recorded video is included in this repository; the live app is interactive and the scenarios above reproduce the main decisions.
- **Simulation-only:** there is no wallet, signing, transaction submission, or on-chain enforcement.
- **Local state only:** browser local storage can be cleared or changed by its owner. It is not an authoritative daily-spend database and must not be used as the source of truth for real funds.
- **Single-asset example:** the caps are denominated in USD and do not do price conversion or token decimal handling.

## References

- [Arena task brief](https://pharos-agent-arena.vercel.app/tasks/policy-gatekeeper)
- [Pharos Skill Engine](https://ai.pharos.xyz/skill-engine)
- [Skill Engine source](https://github.com/PharosNetwork/pharos-skill-engine)
