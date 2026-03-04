# AGENTS.md — Guía para Agentes IA trabajando en Grafeo

Este repositorio implementa **Grafeo**, un servidor MCP que indexa cualquier repositorio hacia un grafo relacional persistente en **SpacetimeDB**.

## Objetivo

- Proveer herramientas MCP para que agentes de código obtengan contexto **persistente** (archivos, símbolos, dependencias, exports, módulos).
- Mantener un flujo seguro para cambios: detectar impacto, reindexar, auditar, y validar.

## Reglas de contribución (rápidas)

- Cambios mínimos y enfocados.
- Evitar APIs inventadas: validar en código antes de usar.
- Antes de tocar indexación o parsing, agregar/actualizar tests.
- Siempre correr:
  - `npx tsc --noEmit`
  - `npm test`

## Arquitectura

- `src/mcp-server.ts`
  - Define las **28 tools** del MCP.
  - Responde consultas leyendo de SpacetimeDB (SQL) + reducers.

- `src/indexer/`
  - `scanner.ts`: walk del FS, ignora dirs comunes, lee archivos.
  - `index.ts`: orquesta escaneo + parsing + persistencia en SpacetimeDB.

- `src/plugins/`
  - `base.ts`: interfaz `LanguagePlugin`.
  - `registry.ts`: enruta por extensión.
  - `typescript.ts`, `python.ts`: parsers reales.
  - `generic.ts`: fallback multi-lenguaje.

- `spacetimedb/src/index.ts`
  - Esquema y reducers del módulo de SpacetimeDB.

## Flujo recomendado (para agentes)

1. **Bootstrap**
   - Usar `session_bootstrap` para obtener:
     - reglas del proyecto
     - tareas activas
     - convenciones
     - estado del índice

2. **Antes de editar**
   - Usar `preflight_check(intent, files[])`.
   - Revisar `get_blast_radius(file)` para medir impacto.

3. **Durante el trabajo**
   - Usar `find_examples(pattern)` antes de agregar nuevas heurísticas.
   - Mantener consistencia en la forma de almacenar datos (tablas y reducers existentes).

4. **Después de editar**
   - Usar `postchange_audit(changes[])` (reindex + log).

## Validación mínima

- `npm run build`
- `npm test`

## Notas

- El MCP usa `stdio` y se integra con IDEs (Windsurf/Cursor/Claude) via `grafeo setup <ide>`.
