import { PlayerColor, type PreGamePlayerInfo, PreGamePlayerReadyState } from "@generale/types";
import { createSignal } from "solid-js";
import { PlayerList } from "../PlayerList";

export const TestPlayerList = () => {
  // 模拟生成测试数据
  const makePlayers = (): PreGamePlayerInfo[] => {
    const names = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank"];
    const colors = Object.values(PlayerColor).filter((v) => typeof v === "number") as number[];
    return names.map((name, i) => ({
      id: `p${i + 1}`,
      name,
      teamId: `T${(i % 2) + 1}`,
      isHost: i === 0,
      ready: i % 2 === 0 ? PreGamePlayerReadyState.Ready : PreGamePlayerReadyState.NotReady,
      tileColor: colors[i % colors.length] as PlayerColor,
    }));
  };

  const [players, setPlayers] = createSignal(makePlayers());
  const [selfId, setSelfId] = createSignal("p1");
  const [hostId, setHostId] = createSignal("p1");

  const onToggleReady = (playerId: string, ready: boolean) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, ready: ready ? PreGamePlayerReadyState.Ready : PreGamePlayerReadyState.NotReady }
          : p,
      ),
    );
  };

  const onKick = (playerId: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
  };

  const onTransferHost = (playerId: string) => {
    setHostId(playerId);
    setPlayers((prev) => prev.map((p) => ({ ...p, isHost: p.id === playerId })));
  };

  return (
    <div class="p-5 space-y-4">
      <h2 class="text-xl font-bold">🧪 PlayerList 测试</h2>

      <div class="flex items-center gap-3">
        <span>当前用户: {selfId()}</span>
        <button type="button" class="btn btn-sm" onClick={() => setSelfId("p1")}>
          切换为 p1 (Host)
        </button>
        <button type="button" class="btn btn-sm" onClick={() => setSelfId("p2")}>
          切换为 p2
        </button>
      </div>

      <PlayerList
        players={players()}
        selfId={selfId()}
        hostId={hostId()}
        onToggleReady={onToggleReady}
        onKick={onKick}
        onTransferHost={onTransferHost}
      />
    </div>
  );
};
