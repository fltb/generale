import { Title, Meta } from "@solidjs/meta";
import { useT } from "../i18n/useT";
import { PLATFORM_NAME, GAME_NAME } from "~/config";

export default function About() {
  const { t } = useT();
  return (
    <main class="max-w-3xl mx-auto px-6 py-10 text-sm text-base-content/80 leading-relaxed space-y-4">
      <Title>{t("About")} — {PLATFORM_NAME}</Title>
      <Meta name="description" content={`${t("About")} ${PLATFORM_NAME}, ${t("an online multiplayer game platform.")}`} />
      <Meta property="og:title" content={`${t("About")} — ${PLATFORM_NAME}`} />
      <Meta property="og:description" content={`${t("About")} ${PLATFORM_NAME}, ${t("an online multiplayer game platform.")}`} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />

      <h1 class="text-xl text-primary font-press-start mb-6">{t("About")}</h1>

      <p>{t("{name} is an online multiplayer gaming platform. Free to play, no download required — just a browser and an internet connection.", { name: PLATFORM_NAME })}</p>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">{t("Games")}</h2>
        <p>{t("<strong>{game}</strong> is our first title — a real-time multiplayer territory conquest strategy game inspired by the classic browser game genre. Each match plays out on a pixel grid map where you command armies, capture territories, and outmaneuver opponents.", { game: GAME_NAME })}</p>
        <p>{t("Upcoming games are in development. {name} is designed as a platform for multiple multiplayer titles sharing the same account system and lobby infrastructure.", { name: PLATFORM_NAME })}</p>
      </section>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">{t("Technology")}</h2>
        <p>{t("Built with modern web technology:")}</p>
        <ul class="list-disc pl-5 space-y-1">
          <li>{t("Frontend: SolidJS + PixiJS (game rendering)")}</li>
          <li>{t("Backend: Elysia (Bun) + SQLite")}</li>
          <li>{t("Real-time: WebSocket with room-based sub-connections")}</li>
          <li>{t("Pixel art: Custom CSS theme, DiceBear avatars")}</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">{t("Open Source")}</h2>
        <p>{t("The entire project is open source under the MIT License. You can find the source code, contribute, report issues, or suggest features on {link}.", { link: "GitHub" })}</p>
      </section>

      <section>
        <h2 class="text-base text-base-content font-semibold mt-6 mb-2">{t("Contact")}</h2>
        <p>{t("For bug reports and feature requests, visit our {link} page.", { link: "GitHub Issues" })}</p>
      </section>
    </main>
  );
}
