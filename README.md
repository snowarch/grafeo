# Grafeo

[![CI](https://github.com/snowarch/grafeo/actions/workflows/ci.yml/badge.svg)](https://github.com/snowarch/grafeo/actions/workflows/ci.yml)

**Deep code intelligence for AI agents.** Give any AI coding assistant persistent, structural understanding of your entire codebase — powered by [SpacetimeDB](https://spacetimedb.com).

Grafeo is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that indexes your project into a relational knowledge graph: files, symbols, dependencies, exports, modules, conventions, decisions, tasks, and change history. AI agents query this graph through 29 specialized tools instead of re-reading your code every session.

---

## Features

- **Universal** — Works with any language. Built-in plugins for TypeScript/JavaScript and Python. Generic fallback for Rust, Go, Java, C#, and more.
- **Auto-detection** — Detects languages, frameworks (Next.js, React, Flask, Django, etc.), and project structure automatically.
- **Persistent knowledge** — SpacetimeDB stores everything relationally. Conventions, decisions, annotations, and tasks survive across sessions.
- **29 MCP tools** — Context, search, blast radius, dependency graphs, conventions, tasks, analytics, and power tools like `session_bootstrap` and `preflight_check`.
- **Plugin architecture** — Add language support by implementing a single `LanguagePlugin` interface.
- **IDE setup** — One command configures Windsurf, Cursor, or Claude Desktop.

## For Coding Agents (Copy/Paste Prompt)

Use this prompt to let a coding agent set up Grafeo in one pass:

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
- Run in this exact order:
  a) npm install
  b) npm run build
  c) (cd spacetimedb && npm install)
  d) spacetime start
  e) spacetime publish grafeo -s local -p ./spacetimedb --no-config -y
  f) npx tsx src/cli.ts init .
  g) SPACETIMEDB_DB=grafeo npx tsx src/cli.ts index .
  h) npx tsx src/cli.ts setup windsurf
- Then run MCP smoke tests over stdio by calling at least:
  - tools/list
  - get_project_stats
  - search_codebase(query="indexProject")
  - get_file_context(path="src/mcp-server.ts")
  - session_bootstrap
- If any tool returns "Error in <tool>", treat it as release-blocking and fix it.
- End with:
  - commands run
  - key outputs
  - what was fixed
  - remaining blockers (if any)
```

Detailed operational docs for agents are in [`docs/`](./docs/README.md).

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **SpacetimeDB CLI** — `curl -sSf https://install.spacetimedb.com | sh`

### 1. Install

```bash
git clone https://github.com/snowarch/grafeo.git
cd grafeo
npm install
cd spacetimedb && npm install && cd ..
```

### 2. Start SpacetimeDB & publish module

```bash
# Start local SpacetimeDB
spacetime start

# Publish the Grafeo module
spacetime publish grafeo --module-path ./spacetimedb
```

Or use the helper script:

```bash
chmod +x start.sh && ./start.sh
```

### 3. Initialize in your project

```bash
# From your project directory:
npx tsx /path/to/grafeo/src/cli.ts init .
```

This auto-detects languages, framework, and creates `.grafeo/config.json`.

### 4. Index your project

```bash
npx tsx /path/to/grafeo/src/cli.ts index .
```

### 5. Configure your IDE

```bash
# Windsurf
npx tsx /path/to/grafeo/src/cli.ts setup windsurf

# Cursor
npx tsx /path/to/grafeo/src/cli.ts setup cursor

# Claude Desktop
npx tsx /path/to/grafeo/src/cli.ts setup claude
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `grafeo init [path]` | Initialize Grafeo in a project (auto-detects everything) |
| `grafeo index [path]` | Index the project into SpacetimeDB |
| `grafeo serve` | Start MCP server (stdio transport) |
| `grafeo setup <ide>` | Configure MCP for your IDE |
| `grafeo status [path]` | Check index status |

---

## MCP Tools (29)

### Context & Understanding
| Tool | Description |
|------|-------------|
| `get_file_context` | Everything about a file: symbols, deps, annotations, dependents |
| `search_codebase` | Fuzzy search across files and symbols |
| `get_dependency_graph` | What a file imports and what depends on it |
| `get_blast_radius` | Risk assessment before editing (LOW/MEDIUM/HIGH/CRITICAL) |
| `get_export_info` | Full info about an exported symbol |
| `get_module_overview` | Module summary: files, entry point, key components |
| `get_framework_info` | Detected framework and project metadata |

### Knowledge Management
| Tool | Description |
|------|-------------|
| `save_convention` | Record a coding convention |
| `get_conventions` | Retrieve conventions by area |
| `save_decision` | Log an architecture decision record |
| `annotate_file` | Add persistent notes to files |
| `get_annotations` | Retrieve file annotations |

### Tasks & Continuity
| Tool | Description |
|------|-------------|
| `create_task` | Create a task for multi-session continuity |
| `update_task` | Update task status |
| `get_active_tasks` | List non-completed tasks |
| `log_change` | Record a file change |

### Analytics
| Tool | Description |
|------|-------------|
| `get_project_stats` | File counts by type/module, symbol counts |
| `find_hotspots` | Most-imported files, most-used exports, high complexity |
| `get_recent_changes` | Recently logged changes |

### Indexing
| Tool | Description |
|------|-------------|
| `reindex_file` | Re-index a single file |
| `reindex_all` | Full project re-index |
| `index_status` | Current index statistics |

### Power Tools
| Tool | Description |
|------|-------------|
| `session_bootstrap` | One call to start a session: rules, tasks, conventions, index status, recent changes |
| `read_file` | Read any file with line numbers |
| `get_project_rules` | Inject AGENTS.md / CLAUDE.md / .cursorrules |
| `preflight_check` | Safety gate before editing: blast radius + deps + conventions for all target files |
| `find_examples` | Grep source files for patterns with context |
| `batch_context` | Multi-file + multi-export context in one call |
| `postchange_audit` | Post-edit: reindex + log + validate all changes |

---

## Architecture

```
grafeo/
├── src/
│   ├── cli.ts              # CLI entry point (init, index, serve, setup, status)
│   ├── mcp-server.ts       # MCP server with 29 tools
│   ├── db.ts               # SpacetimeDB HTTP client
│   ├── config.ts           # Project config management
│   ├── detector.ts         # Auto-detection (languages, frameworks)
│   ├── indexer/
│   │   ├── index.ts        # Main indexer orchestrator
│   │   └── scanner.ts      # File system walker
│   └── plugins/
│       ├── base.ts         # LanguagePlugin interface
│       ├── registry.ts     # Plugin discovery & routing
│       ├── typescript.ts   # TypeScript/JavaScript parser
│       ├── python.ts       # Python parser
│       └── generic.ts      # Fallback parser (Rust, Go, etc.)
├── spacetimedb/
│   └── src/index.ts        # SpacetimeDB schema & reducers
├── test/                   # Unit tests (vitest)
├── start.sh                # Helper to start SpacetimeDB
└── package.json
```

### Data Model (SpacetimeDB)

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `files` | `path` | All indexed files with metadata |
| `symbols` | `id` (auto) | Functions, classes, imports, types, etc. |
| `dependencies` | `id` (auto) | File-to-file import relationships |
| `exports` | `name` | Exported symbols with usage counts |
| `module_summaries` | `module_name` | Module-level aggregates |
| `project_meta` | `key` | Key-value project metadata |
| `custom_entries` | `id` (auto) | Plugin-specific data |
| `decisions` | `id` (auto) | Architecture decision records |
| `conventions` | `id` (auto) | Coding conventions |
| `annotations` | `id` (auto) | File annotations (gotcha, todo, warning) |
| `tasks` | `id` (auto) | Multi-session task tracking |
| `change_history` | `id` (auto) | Change log |

---

## Adding Language Plugins

Implement the `LanguagePlugin` interface:

```typescript
import type { LanguagePlugin } from './plugins/base.js';

export const rustPlugin: LanguagePlugin = {
  name: 'rust',
  extensions: ['.rs'],

  async detectProject(root) {
    // Check for Cargo.toml
  },

  parseFile(content, path) {
    // Extract symbols, imports, exports
  },

  classifyComplexity(content) {
    // Return 'low' | 'medium' | 'high'
  },
};
```

Register it in `src/plugins/registry.ts`:

```typescript
import { rustPlugin } from './rust.js';
// In constructor:
this.register(rustPlugin);
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPACETIMEDB_URL` | `http://127.0.0.1:3000` | SpacetimeDB server URL |
| `SPACETIMEDB_DB` | auto from project name | Database name |
| `GRAFEO_PROJECT_ROOT` | `cwd` | Project root override |

---

## Development

```bash
# Run tests
npm test

# Type check
npx tsc --noEmit

# Run MCP server directly
npx tsx src/mcp-server.ts

# Run CLI
npx tsx src/cli.ts help
```

---

## License

MIT — see [LICENSE](./LICENSE).
