# Grafeo Documentation

This folder contains detailed, English-language operational documentation for contributors and coding agents.

## Contents

1. [Agent Quickstart](./agent-quickstart.md)
   - One-pass setup steps for agents in a fresh environment.
   - Safe default workflow for indexing and validation.

2. [MCP Validation Guide](./mcp-validation.md)
   - End-to-end test flow for Grafeo MCP.
   - Minimum release-blocking smoke suite and failure triage.

3. [MCP Tools Reference](./tools.md)
   - Full tool list with inputs and expected behavior.

## Recommended Reading Order

1. Read `../AGENTS.md` for contribution and safety workflow.
2. Run the setup in `agent-quickstart.md`.
3. Validate MCP behavior with `mcp-validation.md`.
4. Keep `tools.md` open when implementing new tool usage.

## Scope

These docs are intentionally operational. Product overview and architecture summary remain in the repository root `README.md`.

For the public npm-installed MCP server entry point, use `npx -y grafeo-mcp`.
