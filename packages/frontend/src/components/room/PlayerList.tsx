import { type PreGamePlayerInfo } from "@generale/types";
import { type Component, For, Show } from "solid-js";

export interface PlayerListProps {
  players: PreGamePlayerInfo[];
  selfId: string;
  hostId: string;
  onToggleReady: (playerId: string, ready: boolean) => void;
  onKick?: (playerId: string) => void;
  onTransferHost?: (playerId: string) => void;
  onChangeTeam?: (playerId: string, teamId: string) => void;
}

export const PlayerList: Component<PlayerListProps> = (props) => {
  return (
    <div class="space-y-2">
      <For each={props.players}>
        {(p) => {
          return (
            <div class="flex items-center justify-between p-3 bg-base-200 rounded">
              <div class="flex items-center gap-3">
                <div class="avatar">
                  <div class="w-10 h-10 rounded-full bg-primary text-base-100 flex items-center justify-center">
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                </div>
                <div>
                  <div class="font-medium">{p.name} {p.isHost ? <span class="badge ml-2">Host</span> : null}</div>
                  <div class="text-sm opacity-60">队伍: {p.teamId} · 状态: {p.ready === 1 ? 'Ready' : 'Not Ready'}</div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  class={`btn btn-sm ${p.ready === 1 ? 'btn-success' : 'btn-outline'}`}
                  onClick={() => props.onToggleReady(p.id, p.ready !== 1)}
                >
                  {p.ready === 1 ? '取消准备' : '准备'}
                </button>

                <Show when={props.onTransferHost && props.hostId === props.selfId && !p.isHost}>
                  <button class="btn btn-sm btn-ghost" onClick={() => props.onTransferHost!(p.id)}>转让房主</button>
                </Show>

                <Show when={props.onKick && props.hostId === props.selfId && props.selfId !== p.id}>
                  <button class="btn btn-sm btn-error" onClick={() => props.onKick!(p.id)}>踢出</button>
                </Show>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
};
