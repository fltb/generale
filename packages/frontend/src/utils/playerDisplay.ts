/**
 * 给定一组玩家信息，检测 displayName 重名，返回每个玩家的展示名。
 * 重名的玩家会用 `displayName#username` 格式区分，未重名的直接用 displayName。
 */
export function resolveDisplayNames(
  players: Array<{ id: string; name: string; displayName?: string | null }>,
): Map<string, string> {
  const result = new Map<string, string>();

  // 统计 displayName 的出现次数
  const counts = new Map<string, number>();
  for (const p of players) {
    const dn = p.displayName || p.name;
    counts.set(dn, (counts.get(dn) ?? 0) + 1);
  }

  for (const p of players) {
    const dn = p.displayName || p.name;
    if ((counts.get(dn) ?? 0) > 1) {
      result.set(p.id, `${dn}#${p.name}`);
    } else {
      result.set(p.id, dn);
    }
  }

  return result;
}
