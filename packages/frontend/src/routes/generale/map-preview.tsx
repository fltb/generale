import { Title, Meta } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { useT } from "~/i18n/useT";
import { createSignal } from "solid-js";
import MapPreview from "~/components/map-editor/MapPreview";
import CreateRoomModal from "~/components/roomlist/CreateRoomModal";
import GeneraleLayout from "~/components/game/GeneraleLayout";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import Button from "~/ui/Button";

export default function MapPreviewPage() {
  const params = useParams<{ id: string }>();
  const { t } = useT();
  const [createOpen, setCreateOpen] = createSignal(false);

  return (
    <ProtectedRoute>
    <GeneraleLayout>
      <div>
        <Title>{t("Map Preview")} — {t("General E")}</Title>
        <Meta name="description" content={t("Preview custom maps for General E.")} />
        <Meta property="og:title" content={`${t("Map Preview")} — ${t("General E")}`} />
        <Meta property="og:description" content={t("Preview custom maps for General E.")} />
        <Meta property="og:image" content="/og-image.svg" />
        <Meta property="og:type" content="website" />
        <MapPreview mapId={params.id} />
        <div class="text-center my-4">
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            {t("Create room with this map")}
          </Button>
        </div>
        <CreateRoomModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          initialMapId={params.id}
        />
      </div>
    </GeneraleLayout>
    </ProtectedRoute>
  );
}
