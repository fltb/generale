import { vi } from 'vitest';

const store: Map<string, Map<string, any>> = new Map();

function ensureTable(table: string) {
  if (!store.has(table)) store.set(table, new Map());
  return store.get(table)!;
}

function makeChainable(): any {
  const state: { table?: string; filter?: (row: any) => boolean; limitNum?: number } = {};

  return new Proxy({} as any, {
    get(_target, prop) {
      if (prop === 'run') return vi.fn(() => {
        if (state.table) ensureTable(state.table);
        return { changes: 1, lastInsertRowid: Date.now() };
      });
      if (prop === 'get') return vi.fn(() => {
        if (!state.table) return undefined;
        const rows = Array.from(ensureTable(state.table).values());
        const filtered = state.filter ? rows.filter(state.filter) : rows;
        return filtered[0] ?? undefined;
      });
      if (prop === 'all') return vi.fn(() => {
        if (!state.table) return [];
        const rows = Array.from(ensureTable(state.table).values());
        const filtered = state.filter ? rows.filter(state.filter) : rows;
        if (state.limitNum) return filtered.slice(0, state.limitNum);
        return filtered;
      });
      if (prop === 'values') return (vals: any) => {
        if (state.table) {
          const id = vals.id ?? vals.userId ?? String(Date.now());
          ensureTable(state.table).set(id, { ...vals, id });
        }
        return makeChainable();
      };
      if (prop === 'set') return (_vals: any) => makeChainable();
      if (prop === 'where') return (fn: any) => {
        state.filter = fn;
        return makeChainable();
      };
      if (prop === 'limit') return (n: number) => { state.limitNum = n; return makeChainable(); };
      if (prop === 'returning') return () => makeChainable();
      if (prop === 'from') return (table: string) => { state.table = table; return makeChainable(); };
      if (prop === 'select') return () => makeChainable();
      if (prop === 'insert') return (table: string) => { state.table = table; return makeChainable(); };
      if (prop === 'update') return (table: string) => { state.table = table; return makeChainable(); };
      if (prop === 'delete') return (table: string) => { state.table = table; return makeChainable(); };
      if (prop === 'then') return undefined;
      return makeChainable();
    },
  });
}

vi.mock('drizzle-orm/bun-sqlite', () => ({
  drizzle: vi.fn(() => makeChainable()),
  sql: vi.fn(),
  eq: vi.fn((col: any, val: any) => (row: any) => row[col.name] === val),
  and: vi.fn((...fns: any[]) => (row: any) => fns.every((f) => f(row))),
}));
