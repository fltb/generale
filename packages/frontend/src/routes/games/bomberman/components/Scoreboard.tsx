interface ScoreboardProps {
  players: Array<{ name: string; rank: number; score: number }>;
  onBackToRoom: () => void;
}

export function Scoreboard(props: ScoreboardProps) {
  const sorted = [...props.players].sort((a, b) => a.rank - b.rank);

  return (
    <div class="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
      <div class="bg-gray-900 border-2 border-gray-600 p-8 rounded min-w-[300px] text-center pixel-border">
        <h2 class="text-2xl text-white font-bold mb-6">GAME OVER</h2>
        <div class="space-y-2 mb-6">
          {sorted.map((p) => (
            <div class="flex justify-between text-white text-lg">
              <span>
                #{p.rank} {p.name}
              </span>
              <span class="text-gray-400">{p.score} pts</span>
            </div>
          ))}
        </div>
        <button type="button" class="btn btn-primary w-full" onClick={props.onBackToRoom}>
          Back to Room
        </button>
      </div>
    </div>
  );
}
