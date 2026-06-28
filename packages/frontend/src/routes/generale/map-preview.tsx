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
