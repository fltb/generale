import { Title, Meta } from "@solidjs/meta";
import { PLATFORM_NAME, GAME_NAME } from "~/config";

export default function About() {
  return (
    <main class="max-w-3xl mx-auto px-6 py-10 text-sm text-base-content/80 leading-relaxed space-y-4">
      <Title>About — {PLATFORM_NAME}</Title>
      <Meta name="description" content={`About ${PLATFORM_NAME}, an online multiplayer game platform.`} />
      <Meta property="og:title" content={`About — ${PLATFORM_NAME}`} />
      <Meta property="og:description" content={`About ${PLATFORM_NAME}, an online multiplayer game platform.`} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />

      <h1 class="text-xl text-primary font-press-start mb-6">About</h1>

      <p>{PLATFORM_NAME} is an online multiplayer gaming platform. Free to play, no download required — just a browser and an internet connection.</p>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">Games</h2>
        <p><strong>{GAME_NAME}</strong> is our first title — a real-time multiplayer territory conquest strategy game inspired by the classic browser game genre. Each match plays out on a pixel grid map where you command armies, capture territories, and outmaneuver opponents.</p>
        <p>Upcoming games are in development. {PLATFORM_NAME} is designed as a platform for multiple multiplayer titles sharing the same account system and lobby infrastructure.</p>
      </section>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">Technology</h2>
        <p>Built with modern web technology:</p>
        <ul class="list-disc pl-5 space-y-1">
          <li>Frontend: SolidJS + PixiJS (game rendering)</li>
          <li>Backend: Elysia (Bun) + SQLite</li>
          <li>Real-time: WebSocket with room-based sub-connections</li>
          <li>Pixel art: Custom CSS theme, DiceBear avatars</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">Open Source</h2>
        <p>The entire project is open source under the MIT License. You can find the source code, contribute, report issues, or suggest features on <a href="https://github.com/fltb/generale" class="text-primary hover:underline" rel="noopener" target="_blank">GitHub</a>.</p>
      </section>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">Contact</h2>
        <p>For bug reports and feature requests, visit our <a href="https://github.com/fltb/generale/issues" class="text-primary hover:underline" rel="noopener" target="_blank">GitHub Issues</a> page.</p>
      </section>
    </main>
  );
}
