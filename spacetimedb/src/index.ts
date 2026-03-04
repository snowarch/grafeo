import * as server from 'spacetimedb/server';

const { schema, table } = server;
const t = (server as any).t as any;

// =============================================================================
// Grafeo — Universal code intelligence knowledge base for AI agents
// =============================================================================

const spacetimedb = schema({
  // ── Core: File registry ──
  files: table(
    { public: true },
    {
      path: t.string().primaryKey(),
      moduleName: t.string(),
      fileType: t.string(),
      size: t.u64(),
      contentHash: t.string(),
      lastIndexed: t.u64(),
      purpose: t.string(),
      complexity: t.string(),
    }
  ),

  // ── Core: Symbols (functions, classes, variables, types, etc.) ──
  symbols: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      filePath: t.string(),
      name: t.string(),
      kind: t.string(),
      typeInfo: t.string(),
      lineNumber: t.u64(),
      isPublic: t.bool(),
      description: t.string(),
    }
  ),

  // ── Core: Dependencies between files ──
  dependencies: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      sourceFile: t.string(),
      targetFile: t.string(),
      depType: t.string(),
    }
  ),

  // ── Core: Exports — important exported symbols (classes, services, singletons, etc.) ──
  exports: table(
    { public: true },
    {
      name: t.string().primaryKey(),
      filePath: t.string(),
      kind: t.string(),
      properties: t.string(),
      methods: t.string(),
      signals: t.string(),
      usageCount: t.u64(),
      description: t.string(),
    }
  ),

  // ── Core: Module summaries ──
  moduleSummaries: table(
    { public: true },
    {
      moduleName: t.string().primaryKey(),
      fileCount: t.u64(),
      purpose: t.string(),
      keyComponents: t.string(),
      entryPoint: t.string(),
      relatedModules: t.string(),
    }
  ),

  // ── Project: Metadata (language, framework, root, etc.) ──
  projectMeta: table(
    { public: true },
    {
      key: t.string().primaryKey(),
      value: t.string(),
    }
  ),

  // ── Project: Custom entries (plugin-specific data) ──
  customEntries: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      pluginName: t.string(),
      entryType: t.string(),
      entryKey: t.string(),
      entryValue: t.string(),
      filePath: t.string(),
    }
  ),

  // ── Knowledge: Architecture decisions ──
  decisions: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      title: t.string(),
      context: t.string(),
      decision: t.string(),
      consequences: t.string(),
      createdAt: t.u64(),
      tags: t.string(),
    }
  ),

  // ── Knowledge: Coding conventions ──
  conventions: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      area: t.string(),
      rule: t.string(),
      example: t.string(),
      rationale: t.string(),
    }
  ),

  // ── Knowledge: File annotations ──
  annotations: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      filePath: t.string(),
      note: t.string(),
      createdAt: t.u64(),
      category: t.string(),
    }
  ),

  // ── Work: Task tracking ──
  tasks: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      title: t.string(),
      description: t.string(),
      status: t.string(),
      context: t.string(),
      createdAt: t.u64(),
      updatedAt: t.u64(),
    }
  ),

  // ── Work: Change history ──
  changeHistory: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      filePath: t.string(),
      changeType: t.string(),
      summary: t.string(),
      timestamp: t.u64(),
      relatedTask: t.u64(),
    }
  ),
});

export default spacetimedb;

// =============================================================================
// Lifecycle hooks
// =============================================================================

export const init = spacetimedb.init((_ctx: any) => {
  console.info('[Grafeo] Module initialized');
});

export const onConnect = spacetimedb.clientConnected((_ctx: any) => {
  console.info('[Grafeo] Client connected');
});

export const onDisconnect = spacetimedb.clientDisconnected((_ctx: any) => {
  console.info('[Grafeo] Client disconnected');
});

// =============================================================================
// Reducers: Files
// =============================================================================

export const upsert_file = spacetimedb.reducer(
  {
    path: t.string(),
    moduleName: t.string(),
    fileType: t.string(),
    size: t.u64(),
    contentHash: t.string(),
    lastIndexed: t.u64(),
    purpose: t.string(),
    complexity: t.string(),
  },
  (ctx: any, args: any) => {
    const existing = ctx.db.files.path.find(args.path);
    if (existing) {
      ctx.db.files.path.delete(args.path);
    }
    ctx.db.files.insert(args);
  }
);

export const delete_file = spacetimedb.reducer(
  { path: t.string() },
  (ctx: any, { path }: any) => {
    ctx.db.files.path.delete(path);
  }
);

export const clear_files = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.files.iter()) {
    ctx.db.files.path.delete(row.path);
  }
});

// =============================================================================
// Reducers: Symbols
// =============================================================================

export const insert_symbol = spacetimedb.reducer(
  {
    filePath: t.string(),
    name: t.string(),
    kind: t.string(),
    typeInfo: t.string(),
    lineNumber: t.u64(),
    isPublic: t.bool(),
    description: t.string(),
  },
  (ctx: any, args: any) => {
    ctx.db.symbols.insert({ id: 0n, ...args });
  }
);

export const delete_symbols_for_file = spacetimedb.reducer(
  { filePath: t.string() },
  (ctx: any, { filePath }: any) => {
    for (const sym of ctx.db.symbols.iter()) {
      if (sym.filePath === filePath) {
        ctx.db.symbols.id.delete(sym.id);
      }
    }
  }
);

export const clear_symbols = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.symbols.iter()) {
    ctx.db.symbols.id.delete(row.id);
  }
});

// =============================================================================
// Reducers: Dependencies
// =============================================================================

export const insert_dependency = spacetimedb.reducer(
  {
    sourceFile: t.string(),
    targetFile: t.string(),
    depType: t.string(),
  },
  (ctx: any, args: any) => {
    ctx.db.dependencies.insert({ id: 0n, ...args });
  }
);

export const delete_deps_for_file = spacetimedb.reducer(
  { sourceFile: t.string() },
  (ctx: any, { sourceFile }: any) => {
    for (const dep of ctx.db.dependencies.iter()) {
      if (dep.sourceFile === sourceFile) {
        ctx.db.dependencies.id.delete(dep.id);
      }
    }
  }
);

export const clear_dependencies = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.dependencies.iter()) {
    ctx.db.dependencies.id.delete(row.id);
  }
});

// =============================================================================
// Reducers: Exports (generalized from singletons)
// =============================================================================

export const upsert_export = spacetimedb.reducer(
  {
    name: t.string(),
    filePath: t.string(),
    kind: t.string(),
    properties: t.string(),
    methods: t.string(),
    signals: t.string(),
    usageCount: t.u64(),
    description: t.string(),
  },
  (ctx: any, args: any) => {
    const existing = ctx.db.exports.name.find(args.name);
    if (existing) {
      ctx.db.exports.name.delete(args.name);
    }
    ctx.db.exports.insert(args);
  }
);

export const clear_exports = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.exports.iter()) {
    ctx.db.exports.name.delete(row.name);
  }
});

export const delete_exports_for_file = spacetimedb.reducer(
  { filePath: t.string() },
  (ctx: any, { filePath }: any) => {
    for (const row of ctx.db.exports.iter()) {
      if (row.filePath === filePath) {
        ctx.db.exports.name.delete(row.name);
      }
    }
  }
);

// =============================================================================
// Reducers: Module Summaries
// =============================================================================

export const upsert_module_summary = spacetimedb.reducer(
  {
    moduleName: t.string(),
    fileCount: t.u64(),
    purpose: t.string(),
    keyComponents: t.string(),
    entryPoint: t.string(),
    relatedModules: t.string(),
  },
  (ctx: any, args: any) => {
    const existing = ctx.db.moduleSummaries.moduleName.find(args.moduleName);
    if (existing) {
      ctx.db.moduleSummaries.moduleName.delete(args.moduleName);
    }
    ctx.db.moduleSummaries.insert(args);
  }
);

export const clear_module_summaries = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.moduleSummaries.iter()) {
    ctx.db.moduleSummaries.moduleName.delete(row.moduleName);
  }
});

// =============================================================================
// Reducers: Project Metadata
// =============================================================================

export const upsert_project_meta = spacetimedb.reducer(
  { key: t.string(), value: t.string() },
  (ctx: any, args: any) => {
    const existing = ctx.db.projectMeta.key.find(args.key);
    if (existing) {
      ctx.db.projectMeta.key.delete(args.key);
    }
    ctx.db.projectMeta.insert(args);
  }
);

export const clear_project_meta = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.projectMeta.iter()) {
    ctx.db.projectMeta.key.delete(row.key);
  }
});

// =============================================================================
// Reducers: Custom Entries (plugin-specific data)
// =============================================================================

export const insert_custom_entry = spacetimedb.reducer(
  {
    pluginName: t.string(),
    entryType: t.string(),
    entryKey: t.string(),
    entryValue: t.string(),
    filePath: t.string(),
  },
  (ctx: any, args: any) => {
    ctx.db.customEntries.insert({ id: 0n, ...args });
  }
);

export const clear_custom_entries = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.customEntries.iter()) {
    ctx.db.customEntries.id.delete(row.id);
  }
});

export const clear_custom_entries_for_plugin = spacetimedb.reducer(
  { pluginName: t.string() },
  (ctx: any, { pluginName }: any) => {
    for (const row of ctx.db.customEntries.iter()) {
      if (row.pluginName === pluginName) {
        ctx.db.customEntries.id.delete(row.id);
      }
    }
  }
);

export const delete_custom_entries_for_file = spacetimedb.reducer(
  { filePath: t.string() },
  (ctx: any, { filePath }: any) => {
    for (const row of ctx.db.customEntries.iter()) {
      if (row.filePath === filePath) {
        ctx.db.customEntries.id.delete(row.id);
      }
    }
  }
);

// =============================================================================
// Reducers: Decisions
// =============================================================================

export const insert_decision = spacetimedb.reducer(
  {
    title: t.string(),
    context: t.string(),
    decision: t.string(),
    consequences: t.string(),
    createdAt: t.u64(),
    tags: t.string(),
  },
  (ctx: any, args: any) => {
    ctx.db.decisions.insert({ id: 0n, ...args });
  }
);

export const delete_decision = spacetimedb.reducer(
  { id: t.u64() },
  (ctx: any, { id }: any) => {
    ctx.db.decisions.id.delete(id);
  }
);

// =============================================================================
// Reducers: Conventions
// =============================================================================

export const insert_convention = spacetimedb.reducer(
  {
    area: t.string(),
    rule: t.string(),
    example: t.string(),
    rationale: t.string(),
  },
  (ctx: any, args: any) => {
    ctx.db.conventions.insert({ id: 0n, ...args });
  }
);

export const delete_convention = spacetimedb.reducer(
  { id: t.u64() },
  (ctx: any, { id }: any) => {
    ctx.db.conventions.id.delete(id);
  }
);

// =============================================================================
// Reducers: Annotations
// =============================================================================

export const insert_annotation = spacetimedb.reducer(
  {
    filePath: t.string(),
    note: t.string(),
    createdAt: t.u64(),
    category: t.string(),
  },
  (ctx: any, args: any) => {
    ctx.db.annotations.insert({ id: 0n, ...args });
  }
);

export const delete_annotation = spacetimedb.reducer(
  { id: t.u64() },
  (ctx: any, { id }: any) => {
    ctx.db.annotations.id.delete(id);
  }
);

export const delete_annotations_for_file = spacetimedb.reducer(
  { filePath: t.string() },
  (ctx: any, { filePath }: any) => {
    for (const ann of ctx.db.annotations.iter()) {
      if (ann.filePath === filePath) {
        ctx.db.annotations.id.delete(ann.id);
      }
    }
  }
);

// =============================================================================
// Reducers: Tasks
// =============================================================================

export const insert_task = spacetimedb.reducer(
  {
    title: t.string(),
    description: t.string(),
    status: t.string(),
    context: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  },
  (ctx: any, args: any) => {
    ctx.db.tasks.insert({ id: 0n, ...args });
  }
);

export const update_task = spacetimedb.reducer(
  {
    id: t.u64(),
    status: t.string(),
    context: t.string(),
    updatedAt: t.u64(),
  },
  (ctx: any, { id, status, context, updatedAt }: any) => {
    const existing = ctx.db.tasks.id.find(id);
    if (!existing) {
      throw new Error(`Task ${id} not found`);
    }
    ctx.db.tasks.id.delete(id);
    ctx.db.tasks.insert({ ...existing, status, context, updatedAt });
  }
);

export const delete_task = spacetimedb.reducer(
  { id: t.u64() },
  (ctx: any, { id }: any) => {
    ctx.db.tasks.id.delete(id);
  }
);

// =============================================================================
// Reducers: Change History
// =============================================================================

export const insert_change = spacetimedb.reducer(
  {
    filePath: t.string(),
    changeType: t.string(),
    summary: t.string(),
    timestamp: t.u64(),
    relatedTask: t.u64(),
  },
  (ctx: any, args: any) => {
    ctx.db.changeHistory.insert({ id: 0n, ...args });
  }
);

export const clear_change_history = spacetimedb.reducer((ctx: any) => {
  for (const row of ctx.db.changeHistory.iter()) {
    ctx.db.changeHistory.id.delete(row.id);
  }
});

// =============================================================================
// Reducers: Bulk operations for indexer
// =============================================================================

export const clear_all_index_data = spacetimedb.reducer((ctx: any) => {
  for (const r of ctx.db.files.iter()) ctx.db.files.path.delete(r.path);
  for (const r of ctx.db.symbols.iter()) ctx.db.symbols.id.delete(r.id);
  for (const r of ctx.db.dependencies.iter()) ctx.db.dependencies.id.delete(r.id);
  for (const r of ctx.db.exports.iter()) ctx.db.exports.name.delete(r.name);
  for (const r of ctx.db.moduleSummaries.iter()) ctx.db.moduleSummaries.moduleName.delete(r.moduleName);
  for (const r of ctx.db.customEntries.iter()) ctx.db.customEntries.id.delete(r.id);
  console.info('[Grafeo] All index data cleared');
});
