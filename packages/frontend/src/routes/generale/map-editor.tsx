import { Title, Meta } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { useT } from "~/i18n/useT";
import MapEditor from "~/components/map-editor/MapEditor";
import GeneraleLayout from "~/components/game/GeneraleLayout";
import { ProtectedRoute } from "~/components/ProtectedRoute";

export default function MapEditorPage() {
  const params = useParams<{ id?: string }>();
  const { t } = useT();
  return (
    <ProtectedRoute>
    <GeneraleLayout>
      <Title>{t("Map Editor")} — {t("General E")}</Title>
      <Meta name="description" content={t("Create your own custom maps for General E.")} />
      <Meta property="og:title" content={`${t("Map Editor")} — ${t("General E")}`} />
      <Meta property="og:description" content={t("Create your own custom maps for General E.")} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <MapEditor mapId={params.id} />
    </GeneraleLayout>
    </ProtectedRoute>
  );
}
