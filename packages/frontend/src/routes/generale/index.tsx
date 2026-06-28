import { Title, Meta } from "@solidjs/meta";
import RoomList from "~/components/roomlist";

export default function GeneraleHub() {
  return (
    <div class="max-w-6xl mx-auto px-6 py-6">
      <Title>General E — Real-Time Strategy Game</Title>
      <Meta name="description" content="Conquer territories and command armies in this real-time multiplayer strategy game." />
      <Meta property="og:title" content="General E — Real-Time Strategy Game" />
      <Meta property="og:description" content="Conquer territories and command armies in this real-time multiplayer strategy game." />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <RoomList />
    </div>
  );
}
