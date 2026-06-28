import { A } from "@solidjs/router";
import RoomList from "~/components/roomlist";

export default function GeneraleHub() {
  return (
    <div class="max-w-6xl mx-auto px-6 py-6">
      {/* Header */}
      <div class="flex items-center justify-between mb-5">
        <h2 class="font-press-start text-sm text-primary">GENERAL E</h2>
      </div>

      {/* Tabs */}
      <div class="flex border-b-2 border-base-300 mb-5">
        <span class="px-5 py-2 text-sm border-b-2 border-primary text-primary -mb-[2px]">Rooms</span>
        <A href="/maps" class="px-5 py-2 text-sm text-base-content/50 hover:text-base-content border-b-2 border-transparent -mb-[2px]">
          Maps
        </A>
      </div>

      {/* Room list (existing component) */}
      <RoomList />
    </div>
  );
}
