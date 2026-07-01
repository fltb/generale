interface HUDProps {
  timeLeft: number;
  aliveCount: number;
  totalPlayers: number;
}

export function HUD(props: HUDProps) {
  const minutes = Math.floor(props.timeLeft / 60);
  const seconds = props.timeLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div class="fixed top-0 left-0 right-0 flex justify-between text-white text-sm font-mono p-3 pointer-events-none z-50">
      <div class="bg-black/60 px-3 py-1 rounded">{timeStr}</div>
      <div class="bg-black/60 px-3 py-1 rounded">
        {props.aliveCount}/{props.totalPlayers}
      </div>
    </div>
  );
}
