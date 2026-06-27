import { useParams } from '@solidjs/router';
import MapPreview from '~/components/map-editor/MapPreview';

export default function MapPreviewPage() {
  const params = useParams<{ id: string }>();
  return <MapPreview mapId={params.id} />;
}
