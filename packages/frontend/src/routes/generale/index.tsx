import { Title, Meta } from "@solidjs/meta";
import { useT } from "~/i18n/useT";
import RoomList from "~/components/roomlist";
import { ProtectedRoute } from "~/components/ProtectedRoute";

export default function GeneraleHub() {
  const { t } = useT();
  return (
    <ProtectedRoute>
      <div class="max-w-6xl mx-auto px-6 py-6">
        <Title>
          {t("General E")} — {t("Real-Time Strategy Game")}
        </Title>
        <Meta
          name="description"
          content={t("Conquer territories and command armies in this real-time multiplayer strategy game.")}
        />
        <Meta property="og:title" content={`${t("General E")} — ${t("Real-Time Strategy Game")}`} />
        <Meta
          property="og:description"
          content={t("Conquer territories and command armies in this real-time multiplayer strategy game.")}
        />
        <Meta property="og:image" content="/og-image.svg" />
        <Meta property="og:type" content="website" />
        <RoomList />
      </div>
    </ProtectedRoute>
  );
}
