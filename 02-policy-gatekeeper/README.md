# Policy Gatekeeper

A small safety check between an agent request and an action. It explains each decision and only lets approved requests reach the demo executor.

**Demo:** [pharos-policy-gatekeeper-five.vercel.app](https://pharos-policy-gatekeeper-five.vercel.app/) · **Code:** [GitHub](https://github.com/rajdeblol/pharos-policy-gatekeeper)

## Try it

Open the demo and choose a sample request, or enter an amount and destination. Expand **Edit policy config** to change the rules. Changes are saved in your browser; **Reset defaults** restores the original settings.

The default policy allows up to **$250 per request** and **$500 per UTC day**, sends only to two approved addresses, and runs on weekdays from **09:00 to 17:00 UTC**. The end time is exclusive. Address matching ignores letter case.

## Run locally

Requires Node.js 20 or newer.

```sh
npm test
npm start
```

Then open `http://localhost:4174`.

## How it works

`evaluateAction` checks the request against the policy and returns all four results. The first failed check explains a denial. `runGuarded` calls its executor only when every check passes.

The daily cap uses `dailySpendBefore`, supplied by the caller. In this demo that number comes from browser storage, so it is only an illustration—not a trusted spending record. The executor is simulated: there is no wallet connection, signing, or transaction submission.

## A few edge cases

- $250 passes the per-request limit; $250.01 does not.
- If $300 has already been spent today, another $200 passes; $200.01 does not.
- 09:00 is allowed; 17:00 is denied. Weekends are denied by default.
- An approved address with different letter casing passes; a changed address does not.
- Invalid policy settings fail closed. If several checks fail, the trace still shows each one.

Run `npm test` for these cases, timezone boundaries, invalid configuration, combined failures, and proof that a denied request never calls the executor.

## Design and credit

The UI follows Pharos brand cues: blue `#0113B7`, black, white, light gray, and a Helvetica Neue font stack. The official [Pharos brand kit](https://www.pharos.xyz/brandkit) lists PP Neue Montreal and Helvetica Neue; the interface uses system fallbacks when those fonts are unavailable.

AI assistance was used for the interface and parts of the implementation; the project owner set the scope and feature requirements.
