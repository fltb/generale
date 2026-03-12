import { GameInfoSuccessResp, ListGamesQuery } from "@generale/types/dist/api"

export function applyGameFilters(
  games: GameInfoSuccessResp["data"][],
  query: ListGamesQuery
) {
  let result = games;

  if (query.roomName) {
    const q = query.roomName.toLowerCase();
    result = result.filter(g =>
      String(g.roomName ?? "").toLowerCase().includes(q)
    );
  }

  if (query.type) {
    result = result.filter(g => g.type === query.type);
  }

  // ===== map filter =====
  // query.map is string | undefined. string may be:
  // - "small"/"medium"/"large"
  // - "WIDTHxHEIGHT" e.g. "200x100" (custom)
  if (query.map) {
    const mq = query.map.trim();
    const customMatch = mq.match(/^(\d+)[xX](\d+)$/);
    result = result.filter(g => {
      if (!g.map) return false;

      // if query is custom WxH
      if (customMatch) {
        const qw = Number(customMatch[1]);
        const qh = Number(customMatch[2]);

        // g.map can be string or object
        if (typeof g.map === "string") {
          // standard maps don't match a WxH query
          return false;
        } else {
          // compare numeric width/height
          return Number(g.map.width) === qw && Number(g.map.height) === qh;
        }
      }

      // otherwise treat query as standard label ("small"/"medium"/"large")
      if (typeof g.map === "string") {
        return g.map === mq;
      } else {
        // g.map is custom object: custom object doesn't match standard labels
        return false;
      }
    });
  }

  if (query.status) {
    result = result.filter(g => g.status === query.status);
  }

  if (query.hostName) {
    const q = query.hostName.toLowerCase();
    result = result.filter(g =>
      String(g.hostName ?? "").toLowerCase().includes(q)
    );
  }

  if (query.minPlayers) {
    const min = Number(query.minPlayers);
    result = result.filter(g => g.playerCount >= min);
  }

  if (query.maxPlayers) {
    const max = Number(query.maxPlayers);
    result = result.filter(g => g.playerCount <= max);
  }

  if (query.hasPassword !== undefined) {
    const want = query.hasPassword === "true";
    result = result.filter(g => g.hasPassword === want);
  }

  return result;
}

export function applyGameSort(games: GameInfoSuccessResp["data"][], query: ListGamesQuery) {
  if (!query.sortBy) return games

  const order = query.sortOrder === "asc" ? 1 : -1

  return [...games].sort((a, b) => {
    const va = a[query.sortBy!]!
    const vb = b[query.sortBy!]!

    if (va > vb) return 1 * order
    if (va < vb) return -1 * order
    return 0
  })
}

export function paginateGames(games: GameInfoSuccessResp["data"][], query: ListGamesQuery) {
  const offset = Number(query.offset ?? 0)
  const limit = Number(query.limit ?? 20)

  const total = games.length

  return {
    total,
    offset,
    limit,
    items: games.slice(offset, offset + limit),
    hasMore: offset + limit < total
  }
}
