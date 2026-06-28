import { Title, Meta } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import MapEditor from "~/components/map-editor/MapEditor";

export default function MapEditorPage() {
  const params = useParams<{ id?: string }>();
  return (
    <>
      <Title>Map Editor — General E</Title>
      <Meta name="description" content="Create your own custom maps for General E." />
      <Meta property="og:title" content="Map Editor — General E" />
      <Meta property="og:description" content="Create your own custom maps for General E." />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <MapEditor mapId={params.id} />
    </>
  );
}
