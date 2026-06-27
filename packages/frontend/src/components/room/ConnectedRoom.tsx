import type { Component } from "solid-js";
import { usePreGameRoom } from "~/game/usePreGameRoom";
import RoomWithSync, { type RoomWithSyncProps } from "./Room";

export interface ConnectedRoomProps extends Omit<RoomWithSyncProps, "ctrl"> {
  domain: string;
  password?: string;
}

export const ConnectedRoom: Component<ConnectedRoomProps> = (props) => {
  const ctrl = usePreGameRoom({
    domain: props.domain,
    playerId: props.playerId,
    gameId: props.gameId,
    password: props.password,
    get visible() {
      return props.visible;
    },
    onStateUpdate: props.onStateUpdate,
    onSelfStatusChange: props.onSelfStatusChange,
    onRoomStateChange: props.onRoomStateChange,
    onGameEndedReceived: props.onGameEndedReceived,
    onExposeApi: props.onExposeApi,
  });

  return <RoomWithSync ctrl={ctrl} {...props} />;
};

export default ConnectedRoom;
