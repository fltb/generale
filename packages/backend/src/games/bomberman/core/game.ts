import type { BombermanState, BombermanOperation, Bomb, PlayerId } from "@generale/types";
import { GameStatus } from "@generale/types";

const ITEM_DROP_TABLE: { type: string; weight: number }[] = [
  { type: "BOMB_UP", weight: 10 },
  { type: "FIRE_UP", weight: 10 },
  { type: "SPEED_UP", weight: 10 },
  { type: "KICK", weight: 4 },
  { type: "GLOVE", weight: 3 },
  { type: "PUNCH", weight: 3 },
  { type: "REMOTE", weight: 2 },
  { type: "PIERCE", weight: 2 },
  { type: "SPIRIT", weight: 1 },
];

let nextId = 1;
function genId(): string {
  return `bomb_${nextId++}`;
}

const DIRS: Record<string, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function cloneState(state: BombermanState): BombermanState {
  return JSON.parse(JSON.stringify(state));
}

function weightedRandom(table: { type: string; weight: number }[]): string {
  const total = table.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of table) {
    r -= item.weight;
    if (r <= 0) return item.type;
  }
  return table[0]!.type;
}

function hasBombAt(state: BombermanState, x: number, y: number): boolean {
  return state.bombs.some((b) => b.x === x && b.y === y);
}

function movePlayer(player: any, direction: string, state: BombermanState): void {
  const d = DIRS[direction];
  if (!d) return;
  const nx = player.x + d.dx;
  const ny = player.y + d.dy;
  const tile = state.map.tiles[ny]?.[nx];
  if (!tile || tile.type === "hard_wall" || tile.type === "soft_wall") return;
  for (const [, p] of Object.entries(state.players)) {
    const op = p as any;
    if (op.alive && op.playerId !== player.playerId && op.x === nx && op.y === ny) return;
  }
  player.x = nx;
  player.y = ny;

  const itemIdx = state.items.findIndex((i) => i.x === nx && i.y === ny);
  if (itemIdx >= 0) {
    const item = state.items[itemIdx]!;
    state.items.splice(itemIdx, 1);
    if (["BOMB_UP", "FIRE_UP", "SPEED_UP"].includes(item.type)) {
      if (item.type === "BOMB_UP") player.bombMax++;
      else if (item.type === "FIRE_UP") player.blastRadius++;
      else player.speed++;
    } else {
      player.items.push(item.type);
    }
  }
}

function placeBomb(player: any, state: BombermanState): void {
  if (player.bombActive >= player.bombMax) return;
  if (hasBombAt(state, player.x, player.y)) return;
  state.bombs.push({
    id: genId(),
    playerId: player.playerId,
    x: player.x,
    y: player.y,
    fuse: state.config.bombFuse,
    blastRadius: player.blastRadius,
  });
  player.bombActive++;
}

function explode(bomb: Bomb, state: BombermanState, pierce: boolean): void {
  const dirs = [
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];

  for (const dir of dirs) {
    for (let r = 0; r <= bomb.blastRadius; r++) {
      const x = bomb.x + dir.dx * r;
      const y = bomb.y + dir.dy * r;
      const tile = state.map.tiles[y]?.[x];
      if (!tile) break;

      state.explosions.push({ x, y, ttl: 8 });

      for (const [, player] of Object.entries(state.players)) {
        const p = player as any;
        if (p.alive && p.x === x && p.y === y) {
          p.alive = false;
          for (const item of p.items) {
            if (!["BOMB_UP", "FIRE_UP", "SPEED_UP"].includes(item)) {
              state.items.push({ x, y, type: item });
            }
          }
          p.items = [];
        }
      }

      if (tile.type === "hard_wall") break;
      if (tile.type === "soft_wall") {
        tile.type = "empty";
        if (Math.random() < state.config.itemDropRate) {
          const dropType = weightedRandom(ITEM_DROP_TABLE);
          state.items.push({ x, y, type: dropType as any });
        }
        if (!pierce) break;
      }

      if (dir.dx === 0 && dir.dy === 0) break;
    }
  }
}

function processExplosions(state: BombermanState): void {
  const exploded = new Set<string>();
  let toProcess: Bomb[] = state.bombs.filter((b) => b.fuse <= 0);

  while (toProcess.length > 0) {
    const batch = toProcess;
    toProcess = [];
    for (const bomb of batch) {
      if (exploded.has(bomb.id)) continue;
      exploded.add(bomb.id);
      explode(bomb, state, false);
      for (const other of state.bombs) {
        if (!exploded.has(other.id) && other.fuse > 0) {
          const dx = Math.abs(other.x - bomb.x);
          const dy = Math.abs(other.y - bomb.y);
          if ((dx <= bomb.blastRadius && other.y === bomb.y) ||
              (dy <= bomb.blastRadius && other.x === bomb.x)) {
            other.fuse = 0;
            toProcess.push(other);
          }
        }
      }
    }
  }

  state.bombs = state.bombs.filter((b) => !exploded.has(b.id));
}

function killOutOfBounds(state: BombermanState): void {
  const b = state.shrinkBoundary ?? 0;
  if (b <= 0) return;
  for (const [, player] of Object.entries(state.players)) {
    const p = player as any;
    if (p.alive && (p.x < b || p.x >= state.map.width - b || p.y < b || p.y >= state.map.height - b)) {
      p.alive = false;
    }
  }
}

export function tick(
  state: BombermanState,
  queues: Record<PlayerId, BombermanOperation[]>,
): BombermanState {
  const next = cloneState(state);
  next.tick++;

  for (const [pid, ops] of Object.entries(queues)) {
    const player = next.players[pid];
    if (!player?.alive) continue;
    const op = ops[ops.length - 1];
    if (!op) continue;

    switch (op.type) {
      case "MOVE":
        movePlayer(player, op.direction, next);
        break;
      case "PLACE_BOMB":
        placeBomb(player, next);
        break;
    }
  }

  for (const bomb of next.bombs) bomb.fuse--;

  processExplosions(next);

  for (const e of next.explosions) e.ttl--;
  next.explosions = next.explosions.filter((e) => e.ttl > 0);

  if (next.config.roundTimeSec > 0) {
    if (!next.roundTimer) next.roundTimer = next.config.roundTimeSec * next.config.tickRate;
    next.roundTimer--;
    if (next.roundTimer <= 0) {
      next.roundTimer = next.config.roundTimeSec * next.config.tickRate;
      if (next.shrinkBoundary === undefined) next.shrinkBoundary = 0;
      next.shrinkBoundary++;
      killOutOfBounds(next);
    }
  }

  const alive = Object.values(next.players).filter((p: any) => p.alive);
  if (alive.length <= 1) {
    next.status = GameStatus.Ended;
  }

  return next;
}
