# Pharos Agent Arena Builds

Small, independent builds for Pharos Season of AI. Each task has its own folder and can be run on its own; showcase/ is a simple front door to the live demos.

**Live showcase:** [pharos-agent-arena-builds.vercel.app](https://pharos-agent-arena-builds.vercel.app/)

The home page and both demos open in white mode. Use the top-right control to switch between white and dark; subtle motion respects reduced-motion settings.

## Builds

| # | Task | Track | Tier | Points | Folder | Demo |
|---|---|---|---|---:|---|---|
| 01 | Read Contract State | Chain MCP | Easy | 50 | [01-read-contract-state](./01-read-contract-state/) | [Open demo](https://pharos-contract-field-notes.vercel.app/) |
| 02 | Policy Gatekeeper | SkillEngine | Medium | 100 | [02-policy-gatekeeper](./02-policy-gatekeeper/) | [Open demo](https://pharos-policy-gatekeeper-five.vercel.app/) |
| 03 | Event Log Monitor | Chain MCP | Easy | 50 | [03-event-log-monitor](./03-event-log-monitor/) | Deploy pending |

## Quick start

Requires Node.js 20 or newer.

    git clone https://github.com/rajdeblol/pharos-agent-arena-builds.git
    cd pharos-agent-arena-builds
    npm install
    npm run contract

In another terminal, run the policy demo:

    npm run gatekeeper

The contract reader listens on http://localhost:4173; the policy demo listens on http://localhost:4174. Both task folders include their own README with implementation notes. The showcase is static and can be previewed with npm run showcase or served from Vercel.

Run the event monitor with `npm run event-monitor`; it listens on http://localhost:4176.

## Layout

    01-read-contract-state/   ERC-20 snapshot through Pharos Chain MCP
    02-policy-gatekeeper/     spend, allowlist, and time-window checkpoint
    03-event-log-monitor/     live ERC-20 Transfer feed via Chain MCP
    showcase/                 static landing page for the demos

## Notes

- Each task remains a small standalone app inside this collection.
- The policy demo is simulation-only; it does not sign or submit transactions.
- The linked demos are deployed separately. This repository's Vercel project serves the collection showcase.
- Approval and point totals are awarded by Agent Arena reviewers; this repository makes no claim that either submission has been approved.

## References

- [Pharos Agent Arena](https://pharos-agent-arena.vercel.app/)
- [Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp)
- [Pharos Skill Engine](https://github.com/PharosNetwork/pharos-skill-engine)
