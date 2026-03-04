# MCP Tools Reference

Grafeo exposes 29 MCP tools. All tools return text responses (Markdown-friendly) and accept JSON inputs as shown below.

## Context & Understanding

| Tool | Input | Description |
| --- | --- | --- |
| `get_file_context` | `path: string` | File summary: purpose, symbols, dependencies, reverse deps, annotations. |
| `search_codebase` | `query: string`<br>`kind?: string` | Fuzzy search across indexed files/symbols. |
| `get_dependency_graph` | `target: string` | Imports and dependents for a file/export. |
| `get_blast_radius` | `file: string` | Risk assessment by dependent count. |
| `get_export_info` | `name: string` | Export details: properties, methods, usage count + usage files. |
| `get_module_overview` | `module: string` | Module summary: files, entry point, key components. |
| `get_framework_info` | _(none)_ | Detected framework + project metadata. |

## Knowledge Management

| Tool | Input | Description |
| --- | --- | --- |
| `save_convention` | `area: string`<br>`rule: string`<br>`example?: string`<br>`rationale?: string` | Store a coding convention. |
| `get_conventions` | `area?: string` | List conventions (optionally filtered by area). |
| `save_decision` | `title: string`<br>`decision: string`<br>`context?: string`<br>`consequences?: string`<br>`tags?: string` | Store an ADR (architecture decision). |
| `annotate_file` | `path: string`<br>`note: string`<br>`category?: string` | Add a persistent file annotation. |
| `get_annotations` | `path?: string` | List annotations (optionally filtered by file). |

## Tasks & Continuity

| Tool | Input | Description |
| --- | --- | --- |
| `create_task` | `title: string`<br>`description?: string`<br>`context?: string` | Create a persistent task. |
| `update_task` | `id: number`<br>`status: string`<br>`context?: string` | Update task status/context. |
| `get_active_tasks` | _(none)_ | List all non-completed tasks. |
| `log_change` | `file: string`<br>`changeType: string`<br>`summary: string`<br>`relatedTask?: number` | Record a change entry. |

## Analytics

| Tool | Input | Description |
| --- | --- | --- |
| `get_project_stats` | _(none)_ | Counts by file type/module + totals. |
| `find_hotspots` | _(none)_ | Most imported files/exports + high complexity. |
| `get_recent_changes` | `limit?: number` | Recent change log entries. |

## Indexing

| Tool | Input | Description |
| --- | --- | --- |
| `reindex_file` | `path: string` | Re-scan and re-index one file. |
| `reindex_all` | _(none)_ | Full project re-index. |
| `index_status` | _(none)_ | Index totals and last indexed time. |

## Power Tools

| Tool | Input | Description |
| --- | --- | --- |
| `session_bootstrap` | `file_path?: string` | Rules + tasks + conventions + index + recent changes. |
| `read_file` | `path: string`<br>`startLine?: number`<br>`endLine?: number` | Read file with line numbers. |
| `get_project_rules` | `section?: string` | Return project rules (AGENTS/CLAUDE/cursorrules). |
| `preflight_check` | `intent: string`<br>`files: string[]`<br>`evidence?: string` | Blast radius + conventions before edits. |
| `find_examples` | `pattern: string`<br>`fileGlob?: string`<br>`maxResults?: number`<br>`contextLines?: number` | Grep source for a pattern with context. |
| `batch_context` | `files?: string[]`<br>`exports?: string[]` | Combined file + export context. |
| `postchange_audit` | `changes: {file, changeType, summary}[]`<br>`validationEvidence?: string` | Reindex + log after edits. |
