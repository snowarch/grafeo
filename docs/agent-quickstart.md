# Agent Quickstart (One-Pass Setup)

Use this when a coding agent needs to set up Grafeo in a fresh environment without manual back-and-forth.

## Prerequisites

- Node.js >= 18
- SpacetimeDB CLI installed
- Repository cloned locally

## One-Pass Setup Steps (from source)

Run these commands from the Grafeo repository root:

```bash
npm install
npm run build
cd spacetimedb && npm install && cd ..
spacetime start
spacetime publish grafeo -s local -p ./spacetimedb --no-config -y
npx tsx src/cli.ts init .
SPACETIMEDB_DB=grafeo npx tsx src/cli.ts index .
npx tsx src/cli.ts setup windsurf
```

## One-Pass Setup Steps (npm package)

Run these commands from the target project root:

```bash
npm install --save-dev grafeo-mcp
spacetime start
spacetime publish grafeo -s local -p node_modules/grafeo-mcp/spacetimedb --no-config -y
npx grafeo init .
SPACETIMEDB_DB=grafeo npx grafeo index .
npx grafeo setup windsurf
```

## One-Shot Prompt for Coding Agents

Copy and paste this prompt into your coding agent:

```text
You are setting up Grafeo from scratch in this repository.

Goals:
1) Install dependencies
2) Build project
3) Publish SpacetimeDB module locally
4) Initialize and index this repo with Grafeo
5) Configure MCP for my IDE
6) Run MCP smoke tests and report pass/fail with evidence

Execution requirements:
- Use this exact order (from the repo root):
  a) npm install
  b) npm run build
  c) (cd spacetimedb && npm install)
  d) spacetime start
  e) spacetime publish grafeo -s local -p ./spacetimedb --no-config -y
  f) npx tsx src/cli.ts init .
  g) SPACETIMEDB_DB=grafeo npx tsx src/cli.ts index .
  h) npx tsx src/cli.ts setup windsurf
- Then smoke test MCP over stdio by calling at least:
  - tools/list
  - get_project_stats
  - search_codebase(query="indexProject")
  - get_file_context(path="src/mcp-server.ts")
  - session_bootstrap
- If any call returns "Error in <tool>", treat it as release-blocking and fix it.
- End by printing:
  - commands run
  - key outputs
  - what was fixed
  - remaining blockers (if any)
```

## Notes

- For npm-based setup, replace `npx grafeo` with `grafeo` if installed globally.
- For Cursor or Claude Desktop, replace `setup windsurf` with `setup cursor` or `setup claude`.
- If `npm publish` is required later, make sure account 2FA/token policy is satisfied first.
