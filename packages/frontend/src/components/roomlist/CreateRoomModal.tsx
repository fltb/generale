import { createSignal, Show, createEffect } from "solid-js";
import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { createGameApi } from "~/api/gameApi";
import type {
  CreateGameReqBody,
  CreateGameSuccessResp,
  ErrorResp,
} from "@generale/types/dist/api";
import type { ApiError } from "~/api/base";
import { useNavigate } from "@solidjs/router";
import { Button, Input, Select, Alert, Modal, alertDialog } from "~/ui";

/**
 * Props:
 * - open: () => boolean
 * - onClose: () => void
 * - onCreated?: (gameId: string) => void
 */
export default function CreateRoomModal(props: {
  open: () => boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Form state
  const [roomName, setRoomName] = createSignal("");
  const [type, setType] = createSignal<"standard" | "custom">("standard");
  const [teamMode, setTeamMode] = createSignal<"ffa" | "team">("ffa");
  const [maxPlayers, setMaxPlayers] = createSignal<number | "">("");
  const [mapSizeStd, setMapSizeStd] = createSignal<
    "" | "small" | "medium" | "large"
  >("");
  const [customWidth, setCustomWidth] = createSignal<number | "">("");
  const [customHeight, setCustomHeight] = createSignal<number | "">("");
  const [gameMode, setGameMode] = createSignal<"" | string>("");
  const [password, setPassword] = createSignal("");
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  // mutation: create game (correct useMutation signature)
  const createMutation = useMutation<
    CreateGameSuccessResp,
    ApiError<ErrorResp>,
    CreateGameReqBody
  >(() => ({
    mutationFn: async (payload: CreateGameReqBody) => {
      return createGameApi(payload);
    },
    onSuccess: (resp) => {
      const gameId = resp.data?.gameId;
      const pw = password().trim();
      qc.invalidateQueries({ queryKey: ["games"] as const });
      resetForm();
      props.onClose();
      props.onCreated?.(gameId);

      if (gameId) {
        if (pw) sessionStorage.setItem('room-invite-pw', pw);
        navigate(`/game/${encodeURIComponent(gameId)}${pw ? `?join=${encodeURIComponent(pw)}` : ''}`);
      }
    },
    onError: (err: any) => {
      console.error("create game failed", err);
      alertDialog(err?.message ?? "创建房间失败");
    },
  }));

  function resetForm() {
    setRoomName("");
    setMaxPlayers("");
    setMapSizeStd("");
    setCustomWidth("");
    setCustomHeight("");
    setGameMode("");
    setType("standard");
    setTeamMode("ffa");
    setPassword("");
    setShowAdvanced(false);
  }

  function validateAndBuildPayload(): CreateGameReqBody | null {
    const name = roomName().trim();
    if (!name) {
      alertDialog("请输入房间名字（roomName）");
      return null;
    }

    const settings: any = {};

    // maxPlayers optional, but if provided must be integer 2-8
    if (maxPlayers() !== "") {
      const n = Number(maxPlayers());
      if (!Number.isInteger(n) || n < 2 || n > 8) {
        alertDialog("maxPlayers 必须是 2 - 8 之间的整数");
        return null;
      }
      settings.maxPlayers = n;
    }

    // discriminant
    settings.type = type();

    // 队伍模式（缺省 ffa）
    settings.teamMode = teamMode();

    if (type() === "standard") {
      // allow empty (server default) or one of small/medium/large
      if (mapSizeStd()) {
        settings.mapSize = mapSizeStd();
      }
    } else {
      // custom: require numeric width and height within allowed ranges
      const w = Number(customWidth());
      const h = Number(customHeight());
      if (!w || !h) {
        alertDialog("custom 模式需要输入宽度和高度 (width / height)");
        return null;
      }
      if (!Number.isInteger(w) || !Number.isInteger(h)) {
        alertDialog("width/height 必须为整数");
        return null;
      }
      if (w < 10 || w > 500 || h < 10 || h > 500) {
        alertDialog("width/height 必须在 10 - 500 之间");
        return null;
      }
      settings.mapSize = { width: w, height: h };
    }

    // optional extra metadata (server accepts additional keys; include if provided)
    if (gameMode()) settings.gameMode = gameMode();

    // If settings is empty object (no keys other than type?) - still include type for discriminant.
    // Our server expects `gameSettings` optional; but when user hasn't filled anything: decide to omit entirely.
    // We'll omit gameSettings if it has only type and type === "standard" and no other fields (so server defaults apply).
    const hasExtraSettings =
      Object.keys(settings).some((k) => k !== "type") ||
      settings.type === "custom";

    return {
      roomName: name,
      gameSettings: hasExtraSettings ? settings : undefined,
      ...(password().trim() ? { password: password().trim() } : {}),
    };
  }

  async function submit() {
    const payload = validateAndBuildPayload();
    if (!payload) return;
    createMutation.mutate(payload);
  }

  // reset when modal closed
  createEffect(() => {
    if (!props.open()) {
      resetForm();
    }
  });

  return (
    <Show when={props.open()}>
      <Modal boxClass="max-w-2xl">
          <div class="flex justify-between items-start">
            <h3 class="font-bold text-lg">新建房间</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => props.onClose()}
            >
              Close
            </Button>
          </div>

          <div class="mt-4 space-y-3">
            {/* ==== 基本设置 ==== */}
            <label class="block">
              <span class="label-text">房间名</span>
              <Input
                bordered
                class="w-full"
                value={roomName()}
                onInput={(e: any) => setRoomName(e.target.value)}
                placeholder="例如：alice 的房间"
              />
            </label>

            <label class="block">
              <span class="label-text">房间密码（可选，留空为公开）</span>
              <Input
                bordered
                class="w-full"
                type="password"
                value={password()}
                onInput={(e: any) => setPassword(e.target.value)}
                placeholder="设置后玩家需输入密码才能加入"
              />
            </label>

            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="label-text">模式</span>
                <Select
                  bordered
                  class="w-full"
                  value={type()}
                  onChange={(e: any) => setType(e.target.value)}
                >
                  <option value="standard">快速 (预设尺寸)</option>
                  <option value="custom">自定义 (自由尺寸)</option>
                </Select>
              </label>

              <label class="block">
                <span class="label-text">地图大小</span>
                <Show when={type() === "standard"} fallback={
                  <div class="flex gap-2">
                    <Input type="number" min="10" max="500" bordered class="w-full"
                      value={customWidth() === "" ? "" : String(customWidth())}
                      onInput={(e: any) => setCustomWidth(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="宽" />
                    <Input type="number" min="10" max="500" bordered class="w-full"
                      value={customHeight() === "" ? "" : String(customHeight())}
                      onInput={(e: any) => setCustomHeight(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="高" />
                  </div>
                }>
                  <Select bordered class="w-full" value={mapSizeStd()} onChange={(e: any) => setMapSizeStd(e.target.value)}>
                    <option value="">默认 (medium)</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </Select>
                </Show>
              </label>
            </div>

            {/* ==== 高级设置 ==== */}
            <button
              class="text-sm opacity-60 hover:opacity-100 flex items-center gap-1"
              onClick={() => setShowAdvanced(v => !v)}
            >
              <span>{showAdvanced() ? "▾" : "▸"}</span>
              高级设置
            </button>

            <Show when={showAdvanced()}>
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="label-text">最大玩家数</span>
                    <Input
                      type="number" min="2" max="8" bordered class="w-full"
                      value={maxPlayers() === "" ? "" : String(maxPlayers())}
                      onInput={(e: any) => setMaxPlayers(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="2 - 8"
                    />
                  </label>

                  <label class="block">
                    <span class="label-text">队伍模式</span>
                    <Select bordered class="w-full" value={teamMode()} onChange={(e: any) => setTeamMode(e.target.value)}>
                      <option value="ffa">单人 (FFA)</option>
                      <option value="team">组队 (Team)</option>
                    </Select>
                  </label>
                </div>

                <label class="block">
                  <span class="label-text">游戏玩法（可选）</span>
                  <Select bordered class="w-full" value={gameMode()} onChange={(e: any) => setGameMode(e.target.value)}>
                    <option value="">默认</option>
                    <option value="classic">Classic</option>
                    <option value="blitz">Blitz</option>
                    <option value="custom">Custom</option>
                  </Select>
                </label>
              </div>
            </Show>

            <div class="flex justify-end gap-2 mt-2">
              <Button variant="ghost" onClick={() => props.onClose()}>
                取消
              </Button>
              <Button
                variant="primary"
                onClick={submit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "创建中..." : "创建房间"}
              </Button>
            </div>

            <Show when={createMutation.isError}>
              <Alert variant="error" class="mt-2">
                <div>
                  {(createMutation.error as any)?.message ?? "创建失败"}
                </div>
              </Alert>
            </Show>
          </div>
      </Modal>
    </Show>
  );
}
