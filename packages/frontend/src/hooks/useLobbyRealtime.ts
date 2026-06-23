// src/hooks/useLobbyRealtime.ts
import { createEffect, createMemo, on, onCleanup } from "solid-js";
import { useSubConnector, useWS } from "~/hooks/useWebsocket";
import { useQueryClient } from "@tanstack/solid-query";
import type { ListGamesQuery } from "@generale/types";
import { buildListQueryFromFilters } from "~/hooks/useGameListQuery";
import {
  LobbyClientEventType,
  LobbyServerMessageType,
  type LobbyClientEvent,
  type LobbyMessage,
} from "@generale/types";
import type { WSOpenPayloadBase } from "~/ws/manager";

function stableStringify(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

interface UseLobbyRealtimeOptions {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

/**
 * Subscribe to the `lobby-games` websocket domain and keep the
 * useGameListQuery cache (queryKey: ["games", filters, offset, limit, sortBy, sortOrder])
 * in sync with server-side room create/update/delete events.
 *
 * The hook mirrors the filters/options passed to useGameListQuery so that:
 *  - the initial open carries the filters (server uses them for the first snapshot)
 *  - whenever filters change, the hook sends `set-filters` to update server-side filtering
 *  - cache patches only apply to query entries whose raw filters match the current ones
 */
export function useLobbyRealtime(
  filtersAccessor: () => Partial<ListGamesQuery>,
  options?: UseLobbyRealtimeOptions
) {
  const qc = useQueryClient();
  const wsMgr = useWS();

  // ensure underlying ws is connected (provider is created with autoConnect=false)
  if (!wsMgr.isConnected) {
    try {
      wsMgr.connect(true);
    } catch (err) {
      console.warn("[useLobbyRealtime] wsMgr.connect failed", err);
    }
  }

  // reactive view of the server-shaped filters (strings + pagination/sort)
  const serverFilters = createMemo<ListGamesQuery>(() =>
    buildListQueryFromFilters(filtersAccessor(), {
      offset: options?.offset,
      limit: options?.limit,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder,
    })
  );

  const sub = useSubConnector<
    LobbyClientEvent,
    LobbyMessage,
    { filters?: ListGamesQuery } & WSOpenPayloadBase
  >("lobby-games", { autoOpen: true, context: { filters: serverFilters() } });

  // queryKey shape from useGameListQuery: ["games", filtersAccessor(), offset, limit, sortBy, sortOrder]
  function isGamesQueryKey(queryKey: unknown): queryKey is unknown[] {
    return Array.isArray(queryKey) && queryKey[0] === "games";
  }

  function queryKeyMatchesCurrentFilters(queryKey: unknown[]) {
    return stableStringify(queryKey[1] ?? {}) === stableStringify(filtersAccessor());
  }

  function getMatchingGamesQueries() {
    return qc
      .getQueryCache()
      .getAll()
      .filter(
        (q) =>
          isGamesQueryKey(q.queryKey) &&
          queryKeyMatchesCurrentFilters(q.queryKey as unknown[])
      );
  }

  let patchFailureTimer: number | undefined;
  function safeInvalidateAllGamesDebounced() {
    if (patchFailureTimer) window.clearTimeout(patchFailureTimer);
    patchFailureTimer = window.setTimeout(() => {
      qc.invalidateQueries({ predicate: (q) => isGamesQueryKey(q.queryKey) });
      patchFailureTimer = undefined;
    }, 120);
  }

  function applyListSnapshotToCache(list: any[]) {
    for (const q of getMatchingGamesQueries()) {
      qc.setQueryData(q.queryKey, () => list);
    }
  }

  function patchCreated(created: any) {
    const queries = getMatchingGamesQueries();
    let patched = false;
    for (const q of queries) {
      const data = qc.getQueryData(q.queryKey) as any[] | undefined;
      if (!Array.isArray(data)) continue;
      if (data.some((d) => d.id === created.id)) {
        patched = true;
        continue;
      }
      qc.setQueryData(q.queryKey, [created, ...data]);
      patched = true;
    }
    if (!patched) safeInvalidateAllGamesDebounced();
  }

  function patchUpdated(updated: any) {
    const queries = getMatchingGamesQueries();
    let patched = false;
    for (const q of queries) {
      const data = qc.getQueryData(q.queryKey) as any[] | undefined;
      if (!Array.isArray(data)) continue;
      const idx = data.findIndex((d) => d.id === updated.id);
      if (idx < 0) continue;
      const next = [...data];
      next[idx] = updated;
      qc.setQueryData(q.queryKey, next);
      patched = true;
    }
    if (!patched) safeInvalidateAllGamesDebounced();
  }

  function patchDeleted(gameId: string) {
    const queries = getMatchingGamesQueries();
    let patched = false;
    for (const q of queries) {
      const data = qc.getQueryData(q.queryKey) as any[] | undefined;
      if (!Array.isArray(data)) continue;
      const next = data.filter((d) => d.id !== gameId);
      if (next.length === data.length) continue;
      qc.setQueryData(q.queryKey, next);
      patched = true;
    }
    if (!patched) safeInvalidateAllGamesDebounced();
  }

  function handleServerMessage(msg: LobbyMessage) {
    try {
      switch (msg.type) {
        case LobbyServerMessageType.LIST:
          applyListSnapshotToCache(msg.payload);
          break;
        case LobbyServerMessageType.CREATED:
          patchCreated(msg.payload);
          break;
        case LobbyServerMessageType.UPDATED:
          patchUpdated(msg.payload);
          break;
        case LobbyServerMessageType.DELETED:
          patchDeleted(msg.payload.gameId);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error("[useLobbyRealtime] handleServerMessage error", err);
      safeInvalidateAllGamesDebounced();
    }
  }

  sub.onOpen(() => {
    // server emits an initial snapshot on open; explicitly request one as a safety belt
    // so the client always receives a list matching its current filters.
    sub.send({
      type: LobbyClientEventType.REQUEST_LIST,
      payload: {
        filters: serverFilters(),
        offset: options?.offset,
        limit: options?.limit,
      },
    });
  });

  sub.onMessage((msg) => {
    if (!msg) return;
    handleServerMessage(msg);
  });

  // when filters change, push set-filters so server-side push events use the new filters
  createEffect(
    on(
      serverFilters,
      (filters) => {
        if (!sub.ready) return;
        sub.send({
          type: LobbyClientEventType.SET_FILTERS,
          payload: { filters },
        });
      },
      { defer: true }
    )
  );

  onCleanup(() => {
    try {
      sub.close();
    } catch {
      /* ignore */
    }
    if (patchFailureTimer) {
      window.clearTimeout(patchFailureTimer);
      patchFailureTimer = undefined;
    }
  });

  return sub;
}
