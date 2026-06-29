import { Title, Meta } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import { useT } from "~/i18n/useT";
import { createSignal } from "solid-js";
import MapPreview from "~/components/map-editor/MapPreview";
import CreateRoomModal from "~/components/roomlist/CreateRoomModal";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import Button from "~/ui/Button";

export default function MapPreviewPage() {
  const params = useParams<{ id: string }>();
  const { t } = useT();
  const [createOpen, setCreateOpen] = createSignal(false);

  return (
    <ProtectedRoute>
      <div class="min-h-screen bg-base-100 flex flex-col">
        <div>
          <Title>
            {t("Map Preview")} — {t("General E")}
          </Title>
          <Meta name="description" content={t("Preview custom maps for General E.")} />
          <Meta property="og:title" content={`${t("Map Preview")} — ${t("General E")}`} />
          <Meta property="og:description" content={t("Preview custom maps for General E.")} />
          <Meta property="og:image" content="/og-image.svg" />
          <Meta property="og:type" content="website" />
        </div>
        <div class="flex items-center gap-3 px-4 h-12 border-b border-base-300 shrink-0">
          <A href="/maps" class="text-base-content/30 hover:text-base-content" aria-label={t("Back to Maps")}>
            <svg
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M19 12H5m7-7-7 7 7 7" />
            </svg>
          </A>
          <span class="text-sm font-medium text-base-content/60">{t("Map Preview")}</span>
        </div>
        <div class="flex-1">
          <MapPreview mapId={params.id} />
          <div class="text-center my-4">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {t("Create room with this map")}
            </Button>
          </div>
          <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} initialMapId={params.id} />
        </div>
      </div>
    </ProtectedRoute>
  );
}
