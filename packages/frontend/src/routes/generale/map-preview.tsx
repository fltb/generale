import { Title, Meta } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createSignal } from "solid-js";
import MapPreview from "~/components/map-editor/MapPreview";
import CreateRoomModal from "~/components/roomlist/CreateRoomModal";
import Button from "~/ui/Button";

export default function MapPreviewPage() {
  const params = useParams<{ id: string }>();
  const [createOpen, setCreateOpen] = createSignal(false);

  return (
    <div>
      <Title>Map Preview — General E</Title>
      <Meta name="description" content="Preview custom maps for General E." />
      <Meta property="og:title" content="Map Preview — General E" />
      <Meta property="og:description" content="Preview custom maps for General E." />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <MapPreview mapId={params.id} />
      <div class="text-center my-4">
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          用此地图开房
        </Button>
      </div>
      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initialMapId={params.id}
      />
    </div>
  );
}
