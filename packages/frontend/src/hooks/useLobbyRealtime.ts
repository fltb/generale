// src/hooks/useLobbyRealtime.tsx
import { createEffect, onCleanup } from "solid-js";
import { useSubConnector } from "~/hooks/useWebsocket";
import { useQueryClient } from "@tanstack/solid-query";
import type { ListGamesQuery } from "@generale/types/dist/api";
import { buildListQueryFromFilters } from "~/hooks/useGameListQuery"; // your helper
import { LobbyClientEventType, LobbyServerMessageType, type LobbyClientEvent, type LobbyMessage } from "@generale/types";
import type { WSContextBase } from "~/ws/manager";

// helper: deep-equal via stable stringify. Good enough for queryKey object equality here.
function stableStringify(v: unknown) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * options: param mirrors useGameListQuery options (offset, limit, sortBy, sortOrder)
 */
export function useLobbyRealtime(filtersAccessor: () => Partial<ListGamesQuery>, options?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: string }) {
  const qc = useQueryClient();

  // build filters for open context: convert to server expected ListGamesQuery (strings)
  const serverFilters = buildListQueryFromFilters(filtersAccessor(), { offset: options?.offset, limit: options?.limit, sortBy: options?.sortBy, sortOrder: options?.sortOrder });

  // create sub and auto open (useSubConnector will call manager.openDomain)
  const sub = useSubConnector<LobbyClientEvent, LobbyMessage, {filters?: ListGamesQuery} & WSContextBase>('lobby-games', { autoOpen: true, context: { filters: serverFilters } });

  // convenience: helper to match a queryKey's filters portion against our serverFilters
  function queryKeyFiltersEqual(queryKey: unknown[], filtersObj: Partial<ListGamesQuery>) {
    // queryKey shape in useGameListQuery: ["games", filtersAccessor(), offset, limit, sortBy, sortOrder]
    if (!Array.isArray(queryKey)) return false;
    const qFilters = queryKey[1] ?? {};
    return stableStringify(qFilters) === stableStringify(filtersObj);
  }

  // Apply full list snapshot to matching queries (called for room-list)
  function applyListSnapshotToCache(list: any[], filtersObj: Partial<ListGamesQuery>) {
    // find all cached games queries whose filters equal filtersObj
    const queries = qc.getQueryCache().getAll().filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'games');
    for (const q of queries) {
      if (queryKeyFiltersEqual(q.queryKey as unknown[] , filtersObj)) {
        // set data to list (server already paginated if offset/limit was set)
        qc.setQueryData(q.queryKey, () => list);
      }
    }
  }

  // Try to patch cached lists for created/updated/deleted events.
  // If patching wouldn't be safe (e.g. unclear filters), fallback to invalidation.
  let patchFailureTimer: number | undefined;
  function safeInvalidateAllGamesDebounced() {
    if (patchFailureTimer) window.clearTimeout(patchFailureTimer);
    patchFailureTimer = window.setTimeout(() => {
      qc.invalidateQueries({ predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'games' });
      patchFailureTimer = undefined;
    }, 120); // small debounce
  }

  function handleServerMessage(msg: LobbyMessage) {
    try {
      switch (msg.type) {
        case LobbyServerMessageType.LIST: {
          // server sent initial (or requested) snapshot for the filters of this connection
          applyListSnapshotToCache(msg.payload, serverFilters);
          break;
        }

        case LobbyServerMessageType.CREATED: {
          // try to insert created item into cached lists matching our filters
          const created = msg.payload;
          let patched = false;
          const queries = qc.getQueryCache().getAll().filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'games');
          for (const q of queries) {
            if (!queryKeyFiltersEqual(q.queryKey as unknown[], serverFilters)) continue;
            const data = qc.getQueryData(q.queryKey) as any[] | undefined;
            if (!Array.isArray(data)) continue;
            // insert created at head; if duplicate exists, skip
            if (data.some(d => d.id === created.id)) continue;
            const next = [created, ...data];
            qc.setQueryData(q.queryKey, next);
            patched = true;
          }
          if (!patched) safeInvalidateAllGamesDebounced();
          break;
        }

        case LobbyServerMessageType.UPDATED: {
          const updated = msg.payload;
          let patched = false;
          const queries = qc.getQueryCache().getAll().filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'games');
          for (const q of queries) {
            if (!queryKeyFiltersEqual(q.queryKey as unknown[], serverFilters)) continue;
            const data = qc.getQueryData(q.queryKey) as any[] | undefined;
            if (!Array.isArray(data)) continue;
            const idx = data.findIndex(d => d.id === updated.id);
            if (idx >= 0) {
              const next = [...data];
              next[idx] = updated;
              qc.setQueryData(q.queryKey, next);
              patched = true;
            }
          }
          if (!patched) safeInvalidateAllGamesDebounced();
          break;
        }

        case LobbyServerMessageType.DELETED: {
          const { gameId } = msg.payload;
          let patched = false;
          const queries = qc.getQueryCache().getAll().filter(q => Array.isArray(q.queryKey) && q.queryKey[0] === 'games');
          for (const q of queries) {
            if (!queryKeyFiltersEqual(q.queryKey as unknown[], serverFilters)) continue;
            const data = qc.getQueryData(q.queryKey) as any[] | undefined;
            if (!Array.isArray(data)) continue;
            const next = data.filter(d => d.id !== gameId);
            if (next.length !== data.length) {
              qc.setQueryData(q.queryKey, next);
              patched = true;
            }
          }
          if (!patched) safeInvalidateAllGamesDebounced();
          break;
        }

        default:
          // unknown message
          break;
      }
    } catch (err) {
      console.error("[useLobbyRealtime] handleServerMessage error", err);
      safeInvalidateAllGamesDebounced();
    }
  }

  sub.onOpen(() => {
    // server should have emitted initial room-list on open; but to be safe, request one explicitly
    // send request-list to ensure server sends snapshot with our serverFilters
    sub.send({ type: LobbyClientEventType.REQUEST_LIST, payload: { filters: serverFilters, offset: options?.offset, limit: options?.limit } });
  });

  sub.onMessage((msg) => {
    if (!msg) return;
    handleServerMessage(msg);
  });

  sub.onDisconnect(() => {
    // optional: on disconnect show loading indicator or set some state
  });

  onCleanup(() => {
    try { sub.close(); } catch { /* ignore */ }
  });
}