import { useParams } from '@solidjs/router';
import MapEditor from '~/components/map-editor/MapEditor';

export default function MapEditorPage() {
  const params = useParams<{ id?: string }>();
  return <MapEditor mapId={params.id} />;
}
