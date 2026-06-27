import { vi } from "vitest";

const store: Map<string, Map<string, unknown>> = new Map();

function ensureTable(table: string) {
  if (!store.has(table)) store.set(table, new Map());
  return store.get(table)!;
}

function makeChainable(): Record<string, unknown> {
  const state: { table?: string; filter?: (row: unknown) => boolean; limitNum?: number } = {};

  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "run")
        return vi.fn(() => {
          if (state.table) ensureTable(state.table);
          return { changes: 1, lastInsertRowid: Date.now() };
        });
      if (prop === "get")
        return vi.fn(() => {
          if (!state.table) return undefined;
          const rows = Array.from(ensureTable(state.table).values());
          const filtered = state.filter ? rows.filter(state.filter) : rows;
          return filtered[0] ?? undefined;
        });
      if (prop === "all")
        return vi.fn(() => {
          if (!state.table) return [];
          const rows = Array.from(ensureTable(state.table).values());
          const filtered = state.filter ? rows.filter(state.filter) : rows;
          if (state.limitNum) return filtered.slice(0, state.limitNum);
          return filtered;
        });
      if (prop === "values")
        return (vals: Record<string, unknown>) => {
          if (state.table) {
            const id = (vals["id"] ?? vals["userId"] ?? String(Date.now())) as string;
            ensureTable(state.table).set(id, { ...vals, id });
          }
          return makeChainable();
        };
      if (prop === "set") return (_vals: Record<string, unknown>) => makeChainable();
      if (prop === "where")
        return (fn: (row: unknown) => boolean) => {
          state.filter = fn;
          return makeChainable();
        };
      if (prop === "limit")
        return (n: number) => {
          state.limitNum = n;
          return makeChainable();
        };
      if (prop === "returning") return () => makeChainable();
      if (prop === "from")
        return (table: string) => {
          state.table = table;
          return makeChainable();
        };
      if (prop === "select") return () => makeChainable();
      if (prop === "insert")
        return (table: string) => {
          state.table = table;
          return makeChainable();
        };
      if (prop === "update")
        return (table: string) => {
          state.table = table;
          return makeChainable();
        };
      if (prop === "delete")
        return (table: string) => {
          state.table = table;
          return makeChainable();
        };
      if (prop === "then") return undefined;
      return makeChainable();
    },
  });
}

vi.mock("drizzle-orm/bun-sqlite", () => ({
  drizzle: vi.fn(() => makeChainable()),
  sql: vi.fn(),
  eq: vi.fn((col: { name: string }, val: unknown) => (row: Record<string, unknown>) => row[col.name] === val),
  and: vi.fn(
    (...fns: Array<(row: Record<string, unknown>) => boolean>) =>
      (row: Record<string, unknown>) =>
        fns.every((f) => f(row)),
  ),
}));
