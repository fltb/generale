import Hero from "~/components/Hero";
import GameCard from "~/components/GameCard";
import { ProtectedRoute } from "~/components/ProtectedRoute";

export default function Home() {
  return (
    <ProtectedRoute>
      <Hero />
      <section class="max-w-4xl mx-auto px-6 py-8">
        <h2 class="font-press-start text-sm text-base-content/50 mb-5 tracking-widest">GAMES</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameCard
            title="General E"
            description="Conquer territories, command armies, and outsmart your opponents in this real-time multiplayer strategy game."
            meta="▲ 24 online · 2-8 players"
            href="/generale"
          />
          <GameCard
            title="More Coming Soon"
            description="New multiplayer games are in development."
            comingSoon
            href=""
          />
        </div>
      </section>
      <footer class="border-t-2 border-base-300 py-6 text-center text-xs text-base-content/40">
        General E — Online Multiplayer Game Platform
      </footer>
    </ProtectedRoute>
  );
}
