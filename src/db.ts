// SpacetimeDB HTTP API client for Grafeo

const SPACETIMEDB_URL = process.env.SPACETIMEDB_URL || 'http://127.0.0.1:3000';
const SPACETIMEDB_DB = process.env.SPACETIMEDB_DB || 'grafeo';

export interface SqlResult {
  schema: {
    elements: Array<{
      name: { some: string };
      algebraic_type: Record<string, unknown>;
    }>;
  };
  rows: unknown[][];
  total_duration_micros: number;
}

export async function sql(query: string): Promise<SqlResult[]> {
  const res = await fetch(`${SPACETIMEDB_URL}/v1/database/${SPACETIMEDB_DB}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function callReducer(reducer: string, args: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SPACETIMEDB_URL}/v1/database/${SPACETIMEDB_DB}/call/${reducer}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reducer ${reducer} error (${res.status}): ${text}`);
  }
}

export function sqlRowsToObjects(result: SqlResult): Record<string, unknown>[] {
  const columns = result.schema.elements.map(e => e.name.some);
  return result.rows.map(row => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    return obj;
  });
}
