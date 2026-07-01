import { useNavigate } from "@solidjs/router";

export function BombermanHub() {
  const navigate = useNavigate();

  async function createRoom() {
    const res = await fetch("/api/bomberman/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName: "Quick Match" }),
    });
    const data = await res.json();
    if (data.success) {
      navigate(`/bomberman/room/${data.data.gameId}`);
    }
  }

  return (
    <div class="container mx-auto p-8 text-center">
      <h1 class="text-3xl font-bold mb-4">Bomberman</h1>
      <p class="text-gray-400 mb-8">Arena battle — up to 4 players</p>
      <button type="button" class="btn btn-primary" onClick={createRoom}>
        Create Room
      </button>
    </div>
  );
}
