# Docs MCP Onboarding

I tried to get started with `ai.pharos.xyz` using only the Pharos Developer Docs MCP. The docs MCP answered, but its guides mostly led to a local Skill Engine setup or Anvita Flow. They did not give me a verified first-run path for `ai.pharos.xyz`.

**Live page:** [pharos-docs-mcp-onboarding.vercel.app](https://pharos-docs-mcp-onboarding.vercel.app/) · **Source:** [this folder](https://github.com/rajdeblol/pharos-agent-arena-builds/tree/main/04-docs-mcp-onboarding)

## What I tried

The questions below are the ones in the recorded run. The answer notes capture the useful response; the live page can fetch a fresh, full answer for each question.

### 1. Find the first step

**Tool:** `askQuestion`

**Question:**

> I am starting from zero on ai.pharos.xyz. Using only the Pharos developer docs, give me a concise first-session path: account/setup, first agent or skill, and one safe way to try it.

**Answer:** The docs did not describe signup or setup for `ai.pharos.xyz`. They suggested connecting the hosted Pharos Chain MCP to an MCP-compatible AI client and trying a read-only question such as the latest block. That explains a separate chain-data tool, not how to use `ai.pharos.xyz`.

### 2. Try the documented Skill Engine route

**Tool:** `askQuestion`; checked the cited Skill Engine and publishing pages with `getPage`.

**Question:**

> What exact steps and tool/API calls do the docs give for creating and running a first SkillEngine skill on ai.pharos.xyz? Include required config fields and a minimal example.

**Answer:** The docs did not provide an `ai.pharos.xyz` endpoint or workflow. They described Skill Engine as a local toolkit: unpack the package, install Foundry, then use Claude Code and the Piggy Bank example. Hosted publishing instructions pointed to Anvita Flow. The guide referred to a zip but did not give a download location.

### 3. Try a read-only chain query

**Tool:** `askQuestion`, then `getPage` on the Pharos MCP guide.

**Question:**

> How do I make my first read-only on-chain query with Pharos Chain MCP? Give exact tool names and argument shapes for chain info, contract reads, and event logs.

**Answer:** The response named `get_chain_info`, `eth_call`, and `get_logs`, and gave the underlying JSON-RPC parameter shapes. It did not confirm the MCP tools’ own `arguments` objects. The MCP guide lists tools and RPC methods, but has no copyable input examples for each MCP tool. It does say `get_logs` is limited to 1,000 blocks per call.

### 4. Ask how to share proof

**Tool:** `askQuestion`; I also searched the Docs MCP for an `ai.pharos.xyz` share or proof flow.

**Question:**

> How do I create a shareable link from ai.pharos.xyz to prove my completed onboarding to the Pharos Agent Arena? Give the exact steps in that product.

**Answer:** The available docs did not describe an `ai.pharos.xyz` share link or the Agent Arena proof flow. The suggested publishing guide was for Anvita Flow Service Agents, a separate process.

## Gaps and suggested fixes

### 1. The `ai.pharos.xyz` starting path is missing

**Exact query:** “I am starting from zero on ai.pharos.xyz. Using only the Pharos developer docs, give me a concise first-session path: account/setup, first agent or skill, and one safe way to try it.”

**Gap:** The answer redirected to Chain MCP setup but did not explain the AI site’s account, first project, or first run.

**Suggested fix:** Add a short `ai.pharos.xyz` getting-started page with prerequisites, sign-in, a tiny first example, and a safe way to try it.

### 2. Skill Engine instructions do not connect to the AI site

**Exact query:** “What exact steps and tool/API calls do the docs give for creating and running a first SkillEngine skill on ai.pharos.xyz? Include required config fields and a minimal example.”

**Gap:** The response gave local Foundry and Claude Code steps, but no `ai.pharos.xyz` workflow. The package download location was also missing.

**Suggested fix:** Make the intended route clear, link the current Skill Engine release, and show how that local setup relates to `ai.pharos.xyz` (or state plainly that it does not).

### 3. Chain MCP examples stop at JSON-RPC

**Exact query:** “How do I make my first read-only on-chain query with Pharos Chain MCP? Give exact tool names and argument shapes for chain info, contract reads, and event logs.”

**Gap:** JSON-RPC parameters were shown, but the MCP input object expected by each tool was not.

**Suggested fix:** Add copyable `tools/call` examples and sample results for `get_chain_info`, `eth_call`, and `get_logs`, including the 1,000-block limit.

### 4. The reviewer proof flow is undocumented

**Exact query:** “How do I create a shareable link from ai.pharos.xyz to prove my completed onboarding to the Pharos Agent Arena? Give the exact steps in that product.”

**Gap:** The docs did not cover the Arena or explain how to make a reviewer-accessible proof link.

**Suggested fix:** Add a short submission guide that shows acceptable proof links, whether reviewers need to sign in, and how to check a link is public.

## What to submit

- **Proof link:** [Live onboarding page](https://pharos-docs-mcp-onboarding.vercel.app/)
- **Repo link:** [Docs MCP Onboarding source](https://github.com/rajdeblol/pharos-agent-arena-builds/tree/main/04-docs-mcp-onboarding)
- **Video:** Optional for the extra 50 points.

## Run locally

From this folder, run:

```sh
npm install
npx vercel dev
```

Open the local URL Vercel prints. The page is static; `/api/onboard` sends the fixed questions to the Developer Docs MCP. It accepts no custom prompts, does not connect a wallet, and does not send transactions. Live answers are displayed in the page and are not saved as a new report.

## What I managed to build and run

I connected to the Developer Docs MCP and used `askQuestion`, `searchDocumentation`, and `getPage` to follow the onboarding trail and check the gaps against the cited pages. I built a small Vercel page that keeps the recorded questions, answer notes, and suggested fixes together; its live panel can re-run all four questions or one at a time. I ran the four-question live flow successfully. I did not reach an `ai.pharos.xyz` workspace or install and run a Pharos Skill because the docs did not give me a verified route to do that. No wallet or transaction was used.
