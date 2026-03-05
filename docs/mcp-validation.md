# MCP Validation Guide

This guide defines how to validate Grafeo as a real MCP server end-to-end.

## What “MCP E2E” Means

End-to-end means validating the full path:

1. SpacetimeDB module published
2. Project indexed
3. MCP server started over stdio
4. Client can list and call tools successfully

## Required Validation Gates

Run these first:

```bash
npm test
npx tsc --noEmit
npm run build
```

## End-to-End Validation

### 1) Publish module

```bash
spacetime publish grafeo -s local -p ./spacetimedb --no-config -y
```

If installed via npm, point to the package module path:

```bash
npm --prefix node_modules/grafeo-mcp/spacetimedb install
spacetime publish grafeo -s local -p node_modules/grafeo-mcp/spacetimedb --no-config -y
```

### 2) Index target project

```bash
npx tsx src/cli.ts init .
SPACETIMEDB_DB=grafeo npx tsx src/cli.ts index .
```

If installed via npm, use the CLI entry point:

```bash
SPACETIMEDB_DB=grafeo npx grafeo init .
SPACETIMEDB_DB=grafeo npx grafeo index .
```

### 3) MCP smoke test with a real SDK client

Use a Node script with `@modelcontextprotocol/sdk` `StdioClientTransport` and call:

- `tools/list`
- `get_project_stats`
- `search_codebase`
- `get_file_context`
- `find_hotspots`
- `get_recent_changes`
- `session_bootstrap`

For full coverage, run a complete tool sweep using the list in [`tools.md`](./tools.md).

To start the MCP server over stdio using the published npm package, run:

```bash
npx -y grafeo-mcp
```

## Release-Blocking Failures

Treat these as blockers:

- Any tool returning `Error in <tool>: ...`
- SQL subset incompatibilities (for example unsupported `GROUP BY`/`ORDER BY`)
- Reducer payload/runtime errors during indexing

## Repair Policy

When a blocker appears:

1. Reproduce with a minimal tool call.
2. Fix root cause (not a workaround).
3. Re-run full smoke suite.
4. Re-run quality gates (`test`, `tsc`, `build`).

## Evidence to Capture

For each validation run, keep:

- commands executed
- tool pass/fail table
- first output line of each tool
- summary of fixes applied
