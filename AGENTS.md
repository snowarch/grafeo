# AGENTS.md — Guide for AI Agents Working on Grafeo

Grafeo is a production MCP server that indexes any repository into a persistent relational graph powered by SpacetimeDB.

## Mission

- Provide durable, structured codebase context for coding agents (files, symbols, dependencies, exports, modules, conventions, decisions, tasks, change history).
- Preserve safe and repeatable change workflows: analyze impact, edit minimally, reindex, and validate.

## Core Contribution Rules

- Keep changes minimal and focused.
- Do not invent APIs; verify actual behavior in code first.
- Before touching indexing/parsing behavior, add or update tests.
- Always run these gates:
  - `npx tsc --noEmit`
  - `npm test`
  - `npm run build`

## Architecture Map

- `src/mcp-server.ts`
  - Defines the MCP tools and their handlers.
  - Serves data from SpacetimeDB through SQL + reducers.

- `src/indexer/`
  - `scanner.ts`: project file walk, filtering, file reads, hashes.
  - `index.ts`: scan → parse → persist pipeline.

- `src/plugins/`
  - `base.ts`: `LanguagePlugin` contract.
  - `registry.ts`: extension-to-plugin routing.
  - `typescript.ts`, `python.ts`: specialized parsers.
  - `generic.ts`: fallback parser for unsupported languages.

- `spacetimedb/src/index.ts`
  - SpacetimeDB schema and reducers.

## Agent Workflow (Recommended)

1. **Bootstrap context first**
   - Call `session_bootstrap` to get project rules, active tasks, conventions, index status, and recent changes.

2. **Before editing**
   - Call `preflight_check(intent, files[])`.
   - For risky files, inspect blast radius with `get_blast_radius(file)`.

3. **During implementation**
   - Use `find_examples(pattern)` before introducing a new pattern.
   - Keep data writes consistent with existing table/reducer contracts.

4. **After editing**
   - Call `postchange_audit(changes[])` to reindex changed files and log updates.

## MCP Validation Checklist

Use this minimum smoke suite before concluding work:

1. `tools/list`
2. `get_project_stats`
3. `search_codebase`
4. `get_file_context`
5. `session_bootstrap`

If any tool returns `Error in <tool>: ...`, treat it as a release blocker.

## Notes

- Grafeo MCP transport is `stdio`.
- IDE setup entry point: `grafeo setup <windsurf|cursor|claude>`.
