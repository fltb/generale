import type {
  CreateGameReqBody,
  CreateGameSuccessResp,
  ErrorResp,
  GameCreationSettingsRoute,
} from "@generale/types/dist/api";
import { useNavigate } from "@solidjs/router";
import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal, Show } from "solid-js";
import type { ApiError } from "~/api/base";
import { createGameApi } from "~/api/gameApi";
import { useT } from "~/i18n/useT";
import { MapSelector } from "~/components/map-editor/MapSelector";
import { Alert, alertDialog, Button, Input, Modal, Select } from "~/ui";

export default function CreateRoomModal(props: {
  open: () => boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  initialMapId?: string;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [roomName, setRoomName] = createSignal("");
  const [type, setType] = createSignal<"standard" | "custom">("standard");
  const [teamMode, setTeamMode] = createSignal<"ffa" | "team">("ffa");
  const [maxPlayers, setMaxPlayers] = createSignal<number | "">("");
  const [mapSizeStd, setMapSizeStd] = createSignal<"" | "small" | "medium" | "large">("");
  const [customWidth, setCustomWidth] = createSignal<number | "">("");
  const [customHeight, setCustomHeight] = createSignal<number | "">("");
  const [gameMode, setGameMode] = createSignal<"" | string>("");
  const [password, setPassword] = createSignal("");
  const [customMapId, setCustomMapId] = createSignal("");
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  const createMutation = useMutation<CreateGameSuccessResp, ApiError<ErrorResp>, CreateGameReqBody>(() => ({
    mutationFn: async (payload: CreateGameReqBody) => createGameApi(payload),
    onSuccess: (resp) => {
      const gameId = resp.data?.gameId;
      const pw = password().trim();
      qc.invalidateQueries({ queryKey: ["games"] as const });
      resetForm();
      props.onClose();
      props.onCreated?.(gameId);
      if (gameId) {
        if (pw) sessionStorage.setItem("room-invite-pw", pw);
        navigate(`/game/${encodeURIComponent(gameId)}${pw ? `?join=${encodeURIComponent(pw)}` : ""}`);
      }
    },
    onError: (err: unknown) => {
      console.error("create game failed", err);
      alertDialog((err instanceof Error ? err.message : null) ?? t("创建失败"));
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
    setCustomMapId("");
    setShowAdvanced(false);
  }

  function validateAndBuildPayload(): CreateGameReqBody | null {
    const name = roomName().trim();
    if (!name) {
      alertDialog(t("请输入房间名字"));
      return null;
    }

    const settings: Record<string, unknown> = {};
    settings.type = type();
    settings.teamMode = teamMode();

    if (maxPlayers() !== "") {
      const n = Number(maxPlayers());
      if (!Number.isInteger(n) || n < 2 || n > 8) {
        alertDialog(t("maxPlayers 必须是 2 - 8 的整数"));
        return null;
      }
      settings.maxPlayers = n;
    }

    if (type() === "standard") {
      if (mapSizeStd()) settings.mapSize = mapSizeStd();
    } else {
      const hasMap = !!customMapId().trim();
      if (!hasMap) {
        const w = Number(customWidth());
        const h = Number(customHeight());
        if (!(w && h)) {
          alertDialog(t("custom 模式需要输入宽度和高度，或选择自定义地图"));
          return null;
        }
        if (!(Number.isInteger(w) && Number.isInteger(h))) {
          alertDialog(t("宽/高必须为整数"));
          return null;
        }
        if (w < 10 || w > 500 || h < 10 || h > 500) {
          alertDialog(t("宽/高必须在 10-500 之间"));
          return null;
        }
        settings.mapSize = { width: w, height: h };
      }
      if (hasMap) settings.customMapId = customMapId().trim();
    }

    if (gameMode()) settings.gameMode = gameMode();

    const hasExtra = Object.keys(settings).some((k) => k !== "type") || settings.type === "custom";
    return {
      roomName: name,
      gameSettings: hasExtra ? (settings as GameCreationSettingsRoute) : undefined,
      ...(password().trim() ? { password: password().trim() } : {}),
    };
  }

  function submit() {
    const payload = validateAndBuildPayload();
    if (!payload) return;
    createMutation.mutate(payload);
  }

  createEffect(() => {
    if (!props.open()) {
      resetForm();
      return;
    }
    if (props.initialMapId) {
      setType("custom");
      setCustomMapId(props.initialMapId);
      setShowAdvanced(true);
    }
    if (type() === "custom") setShowAdvanced(true);
  });

  return (
    <Show when={props.open()}>
      <Modal boxClass="max-w-lg">
        <div class="flex justify-between items-start">
          <h3 class="font-bold text-lg">{t("新建房间")}</h3>
          <Button size="sm" variant="ghost" onClick={() => props.onClose()}>
            {t("Close")}
          </Button>
        </div>

        <div class="mt-4 space-y-3">
          <label class="block" for="cr-name">
            <span class="label-text">{t("房间名")}</span>
            <Input
              data-testid="create-room-name"
              id="cr-name"
              bordered
              class="w-full"
              value={roomName()}
              onInput={(e) => setRoomName(e.target.value)}
              placeholder={t("例如：alice 的房间")}
            />
          </label>

          <label class="block" for="cr-password">
            <span class="label-text">{t("密码（可选）")}</span>
            <Input
              data-testid="create-room-password"
              id="cr-password"
              bordered
              class="w-full"
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.target.value)}
              placeholder={t("留空为公开房间")}
            />
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="block" for="cr-mode">
              <span class="label-text">{t("模式")}</span>
              <Select
                id="cr-mode"
                bordered
                class="w-full"
                value={type()}
                onChange={(e) => setType(e.target.value as "standard" | "custom")}
              >
                <option value="standard">{t("快速")}</option>
                <option value="custom">{t("自定义")}</option>
              </Select>
            </label>

            <label class="block" for="cr-map-size">
              <span class="label-text">{t("地图大小")}</span>
              <Show
                when={type() === "standard"}
                fallback={
                  <div class="text-sm py-2 opacity-50">{customMapId() ? t("由所选地图确定") : t("在高级设置中配置")}</div>
                }
              >
                <Select
                  id="cr-map-size"
                  bordered
                  class="w-full"
                  value={mapSizeStd()}
                  onChange={(e) => setMapSizeStd(e.target.value as "" | "small" | "medium" | "large")}
                >
                  <option value="">{t("默认 (medium)")}</option>
                  <option value="small">{t("Small (10×10)")}</option>
                  <option value="medium">{t("Medium (20×20)")}</option>
                  <option value="large">{t("Large (40×40)")}</option>
                </Select>
              </Show>
            </label>
          </div>

          <button
            type="button"
            class="text-sm opacity-60 hover:opacity-100 flex items-center gap-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span>{showAdvanced() ? "▾" : "▸"}</span> {t("高级设置")}
          </button>

          <Show when={showAdvanced()}>
            <div class="space-y-3 pl-2 border-l-2 border-base-300">
              <div class="grid grid-cols-2 gap-2">
                <label class="block" for="cr-max-players">
                  <span class="label-text">{t("最大玩家数")}</span>
                  <Input
                    id="cr-max-players"
                    type="number"
                    min="2"
                    max="8"
                    bordered
                    class="w-full"
                    value={maxPlayers() === "" ? "" : String(maxPlayers())}
                    onInput={(e) => setMaxPlayers(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="2 - 8"
                  />
                </label>
                <label class="block" for="cr-team-mode">
                  <span class="label-text">{t("队伍模式")}</span>
                  <Select
                    id="cr-team-mode"
                    bordered
                    class="w-full"
                    value={teamMode()}
                    onChange={(e) => setTeamMode(e.target.value as "ffa" | "team")}
                  >
                    <option value="ffa">{t("单人 (FFA)")}</option>
                    <option value="team">{t("组队 (Team)")}</option>
                  </Select>
                </label>
              </div>

              <label class="block" for="cr-game-mode">
                <span class="label-text">{t("游戏玩法（可选）")}</span>
                <Select
                  id="cr-game-mode"
                  bordered
                  class="w-full"
                  value={gameMode()}
                  onChange={(e) => setGameMode(e.target.value)}
                >
                  <option value="">{t("默认")}</option>
                  <option value="classic">{t("Classic")}</option>
                  <option value="blitz">{t("Blitz")}</option>
                  <option value="custom">{t("Custom")}</option>
                </Select>
              </label>

              <Show when={type() === "custom"}>
                <div class="border-t border-base-300 pt-2 space-y-3">
                  <div class="block">
                    <span class="label-text">{t("自定义地图")}</span>
                    <span class="label-text-alt">
                      {t("是否使用地图工坊预设地图，使用后不可调整地图尺寸。")}
                      <a href="/maps" target="_blank" class="link" rel="noopener">
                        {t("浏览地图工坊")}
                      </a>
                    </span>
                    <MapSelector
                      value={customMapId()}
                      onChange={setCustomMapId}
                      placeholder={t("留空使用随机生成（进房可调宽高/地形频率）")}
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-2">
                    <label class="block" for="cr-width">
                      <span class="label-text">{t("宽")}</span>
                      <Input
                        id="cr-width"
                        type="number"
                        min="10"
                        max="500"
                        bordered
                        class="w-full"
                        value={customWidth() === "" ? "" : String(customWidth())}
                        onInput={(e) => setCustomWidth(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder={customMapId() ? t("由地图确定") : "10-500"}
                        disabled={!!customMapId()}
                      />
                    </label>
                    <label class="block" for="cr-height">
                      <span class="label-text">{t("高")}</span>
                      <Input
                        id="cr-height"
                        type="number"
                        min="10"
                        max="500"
                        bordered
                        class="w-full"
                        value={customHeight() === "" ? "" : String(customHeight())}
                        onInput={(e) => setCustomHeight(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder={customMapId() ? t("由地图确定") : "10-500"}
                        disabled={!!customMapId()}
                      />
                    </label>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          <div class="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => props.onClose()}>
              {t("取消")}
            </Button>
            <Button data-testid="create-room-submit" variant="primary" onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending ? t("创建中...") : t("创建房间")}
            </Button>
          </div>

          <Show when={createMutation.isError}>
            <Alert variant="error" class="mt-2">
              <div>{(createMutation.error as Error)?.message ?? t("创建失败")}</div>
            </Alert>
          </Show>
        </div>
      </Modal>
    </Show>
  );
}
