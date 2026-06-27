import { Application } from "solid-pixi";
import MapRenderTest from "~/components/__tests__/MapRenderTest";

export default function Test() {
  return (
    <main>
      <Application
        background="#1099bb"
        resizeTo={window}
        resolution={window.devicePixelRatio}
        autoDensity={true}
        antialias={true}
      >
        <MapRenderTest />
      </Application>

      {/* <Title>Test Page</Title>
            <h1>Test</h1>
            <GameRoomTesterWithHook />
            <GameRoomStateSyncTester />
            <TestPlayerList />
            <TestPreGameControls />
            <TestPreGameRoomStateFrom />
            <TestPreGameMapSettingForm />
            <RoomIntegrationTest /> */}
    </main>
  );
}
