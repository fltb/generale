/**
 * useGameListQuery.ts
 *
 * Hook 封装：把前端 filters -> listGamesApi(query)
 * 使用 TanStack Solid Query（useQuery）
 */

import type { ListGamesQuery } from "@generale/types";
import { useQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";
import { listGamesApi } from "~/routes/games/generale/api/gameApi";

/**
 * 将前端友好的 filters（部分字段）转换为后端 `ListGamesQuery`（字符串形式）
 * 接受一个部分 ListGamesQuery（字段类型都是 string | undefined），返回同形态对象
 */
export function buildListQueryFromFilters(
  filters: Partial<ListGamesQuery> & Record<string, string | undefined>,
  opts?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: string },
): ListGamesQuery {
  const q: Record<string, string> = {};

  // copy strings/values if provided (ListGamesQuery expects strings)
  for (const key of Object.keys(filters)) {
    const v = filters[key as keyof typeof filters];
    if (v === undefined || v === null || v === "") continue;
    // ensure string
    q[key] = String(v);
  }

  // pagination & sorting defaults
  if (opts?.offset !== undefined) q.offset = String(opts.offset);
  if (opts?.limit !== undefined) q.limit = String(opts.limit ?? 50);
  if (opts?.sortBy) q.sortBy = opts.sortBy;
  if (opts?.sortOrder) q.sortOrder = opts.sortOrder;

  return q as ListGamesQuery;
}

/**
 * useGameListQuery
 * @param filtersAccessor - Solid Accessor 返回当前 filters（部分 ListGamesQuery）
 * @param options - 可选: offset/limit/sortBy/sortOrder
 * @returns Solid Query 返回值
 */
export function useGameListQuery(
  filtersAccessor: Accessor<Partial<ListGamesQuery>>,
  options?: { offset?: number; limit?: number; sortBy?: string; sortOrder?: string },
) {
  return useQuery(() => ({
    queryKey: [
      "games",
      filtersAccessor(),
      options?.offset ?? 0,
      options?.limit ?? 50,
      options?.sortBy,
      options?.sortOrder,
    ],
    queryFn: async () => {
      const q = buildListQueryFromFilters(filtersAccessor(), {
        offset: options?.offset ?? 0,
        limit: options?.limit ?? 50,
        sortBy: options?.sortBy,
        sortOrder: options?.sortOrder,
      });
      const res = await listGamesApi(q);
      // backend 返回 shape: { success, data, meta }
      return res.data ?? [];
    },
    retry: false,
    refetchOnWindowFocus: true,
  }));
}
