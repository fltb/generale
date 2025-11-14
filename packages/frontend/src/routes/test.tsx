import { Title } from "@solidjs/meta";
import { Application } from "solid-pixi";
import GameRoomStateSyncTester from "~/components/__tests__/GameRoomStateSyncTester";
import GameRoomTesterWithHook from "~/components/__tests__/GameRoomTester";
import MapRenderTest from "~/components/__tests__/MapRenderTest";
import RoomIntegrationTest from "~/components/room/__tests__/RoomIntegrationTest";
import { TestPlayerList } from "~/components/room/__tests__/TestPlayerList";
import { TestPreGameControls } from "~/components/room/__tests__/TestPreGameControls";
import TestPreGameMapSettingForm from "~/components/room/__tests__/TestPreGameMapSettingForm";
import { TestPreGameRoomStateFrom } from "~/components/room/__tests__/TestPreGameRoomStateFrom";

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

            <Title>Test Page</Title>
            <h1>Test</h1>
            <GameRoomTesterWithHook />
            <GameRoomStateSyncTester />
            <TestPlayerList />
            <TestPreGameControls />
            <TestPreGameRoomStateFrom />
            <TestPreGameMapSettingForm />
            <RoomIntegrationTest />

        </main>
    );
}
