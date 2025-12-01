// src/routes/index.tsx  (或你原来放 Home 的文件)
import { ProtectedRoute } from "~/components/ProtectedRoute";
import RoomList from "~/components/roomlist";

/**
 * Home — 包裹 WebSocketProvider，使得 RoomList 能访问 WS manager / sub connector
 */
export default function Home() {


  return (
    <ProtectedRoute>
      {/* WebSocketProvider 将对其 children 自动建立管理器。
          我把 autoConnect 留空（默认会 autoConnect），如果需要手动连接可以传 autoConnect={false} */}
        <main class="container rounded-2xl shadow mx-auto mt-4 h-[84vh] flex flex-row">
          <ul class="menu menu-xl bg-base-200 w-56 h-full">
            <li><a>ROOM</a></li>
            <li><a>MAP</a></li>
            <li><a>Item 3</a></li>
          </ul>

          <div class="w-full h-full">
            <RoomList />
          </div>
        </main>
    </ProtectedRoute>
  );
}
