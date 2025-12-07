import { createSignal, Show, createEffect } from "solid-js";
import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { createGameApi } from "~/api/gameApi";
import type { CreateGameReqBody, CreateGameSuccessResp, ErrorResp } from "@generale/types/dist/api";
import type { ApiError } from "~/api/base";

/**
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onCreated?: (gameId: string) => void
 */
export default function CreateRoomModal(props: {
    open: () => boolean;
    onClose: () => void;
    onCreated?: (id: string) => void;
}) {
    const qc = useQueryClient();

    // Form signals
    const [roomName, setRoomName] = createSignal("");
    const [type, setType] = createSignal<"standard" | "custom">("standard"); // discriminant
    const [maxPlayers, setMaxPlayers] = createSignal<number | "">("");
    const [mapSizeStd, setMapSizeStd] = createSignal<"" | "small" | "medium" | "large">("");
    const [customWidth, setCustomWidth] = createSignal<number | "">("");
    const [customHeight, setCustomHeight] = createSignal<number | "">("");
    const [gameMode, setGameMode] = createSignal<"" | "classic" | "blitz" | "custom">(""); // gameplay mode (optional)

    // mutation: create game
    const createMutation = useMutation<
        CreateGameSuccessResp,
        ApiError<ErrorResp>,
        CreateGameReqBody
    >(() => ({
        mutationFn: async (payload: CreateGameReqBody) => {
            return createGameApi(payload);
        },
        onSuccess: (resp) => {
            qc.invalidateQueries({ queryKey: ["games"] as const });
            // reset
            setRoomName("");
            setMaxPlayers("");
            setMapSizeStd("");
            setCustomWidth("");
            setCustomHeight("");
            setGameMode("");
            props.onClose();
            props.onCreated?.(resp.data.gameId);
        },
        onError: (err: any) => {
            console.error("create game failed", err);
            alert(err?.message ?? "创建房间失败");
        }
    }));

    function validateAndBuildPayload(): CreateGameReqBody | null {
        const name = roomName().trim();
        if (!name) {
            alert("请输入房间名字（roomName）");
            return null;
        }

        const settings: any = {};

        if (maxPlayers() !== "") {
            const n = Number(maxPlayers());
            if (Number.isNaN(n) || n < 2 || n > 8) {
                alert("maxPlayers 必须是 2 - 8 之间的整数");
                return null;
            }
            settings.maxPlayers = n;
        }

        // type discriminant: standard or custom
        settings.type = type();

        if (type() === "standard") {
            // allow empty (server default) or one of small/medium/large
            if (mapSizeStd()) {
                settings.mapSize = mapSizeStd();
            }
        } else {
            // custom: require width and height
            const w = Number(customWidth());
            const h = Number(customHeight());
            if (!w || !h) {
                alert("custom 模式需要输入宽度和高度 (width / height)");
                return null;
            }
            if (w < 10 || w > 500 || h < 10 || h > 500) {
                alert("width/height 必须在 10 - 500 之间");
                return null;
            }
            settings.mapSize = { width: w, height: h };
        }

        if (gameMode()) settings.gameMode = gameMode();

        return { roomName: name, gameSettings: Object.keys(settings).length ? settings : undefined };
    }

    async function submit() {
        const payload = validateAndBuildPayload();
        if (!payload) return;
        createMutation.mutate(payload);
    }

    // reset when modal closed
    createEffect(() => {
        if (!props.open()) {
            setRoomName("");
            setMaxPlayers("");
            setMapSizeStd("");
            setCustomWidth("");
            setCustomHeight("");
            setGameMode("");
            setType("standard");
        }
    });

    return (
        <Show when={props.open()}>
            <div class="modal modal-open">
                <div class="modal-box max-w-2xl">
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-lg">新建房间</h3>
                        <button class="btn btn-sm btn-ghost" onClick={() => props.onClose()}>Close</button>
                    </div>

                    <div class="mt-4 space-y-3">
                        <label class="block">
                            <span class="label-text">房间名 (roomName)</span>
                            <input
                                class="input input-bordered w-full"
                                value={roomName()}
                                onInput={(e: any) => setRoomName(e.target.value)}
                                placeholder="例如：alice 的房间"
                            />
                        </label>

                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span class="label-text">房间类别 (type)</span>
                                <select class="select select-bordered w-full" value={type()} onChange={(e: any) => setType(e.target.value)}>
                                    <option value="standard">standard (快速)</option>
                                    <option value="custom">custom (自定义尺寸)</option>
                                </select>
                            </label>

                            <label class="block">
                                <span class="label-text">最大玩家数（可选）</span>
                                <input
                                    type="number"
                                    min="2"
                                    max="8"
                                    class="input input-bordered w-full"
                                    value={maxPlayers() === "" ? "" : String(maxPlayers())}
                                    onInput={(e: any) => {
                                        const v = e.target.value;
                                        setMaxPlayers(v === "" ? "" : Number(v));
                                    }}
                                    placeholder="2 - 8"
                                />
                            </label>
                        </div>

                        <Show when={type() === "standard"}>
                            <div>
                                <label class="block">
                                    <span class="label-text">地图 (standard)</span>
                                    <select class="select select-bordered w-full" value={mapSizeStd()} onChange={(e: any) => setMapSizeStd(e.target.value)}>
                                        <option value="">默认 (medium)</option>
                                        <option value="small">small</option>
                                        <option value="medium">medium</option>
                                        <option value="large">large</option>
                                    </select>
                                </label>
                            </div>
                        </Show>

                        <Show when={type() === "custom"}>
                            <div class="grid grid-cols-2 gap-2">
                                <label>
                                    <span class="label-text">width (10 - 500)</span>
                                    <input
                                        type="number"
                                        min="10"
                                        max="500"
                                        class="input input-bordered w-full"
                                        value={customWidth() === "" ? "" : String(customWidth())}
                                        onInput={(e: any) => {
                                            const v = e.target.value;
                                            setCustomWidth(v === "" ? "" : Number(v));
                                        }}
                                        placeholder="宽度"
                                    />
                                </label>
                                <label>
                                    <span class="label-text">height (10 - 500)</span>
                                    <input
                                        type="number"
                                        min="10"
                                        max="500"
                                        class="input input-bordered w-full"
                                        value={customHeight() === "" ? "" : String(customHeight())}
                                        onInput={(e: any) => {
                                            const v = e.target.value;
                                            setCustomHeight(v === "" ? "" : Number(v));
                                        }}
                                        placeholder="高度"
                                    />
                                </label>
                            </div>
                        </Show>

                        <label>
                            <span class="label-text">游戏玩法 (可选)</span>
                            <select class="select select-bordered w-full" value={gameMode()} onChange={(e: any) => setGameMode(e.target.value)}>
                                <option value="">默认</option>
                                <option value="classic">classic</option>
                                <option value="blitz">blitz</option>
                                <option value="custom">custom</option>
                            </select>
                        </label>

                        <div class="flex justify-end gap-2 mt-2">
                            <button class="btn btn-ghost" onClick={() => props.onClose()}>取消</button>
                            <button class="btn btn-primary" onClick={submit} disabled={createMutation.isPending}>
                                {createMutation.isPending ? "创建中..." : "创建房间"}
                            </button>
                        </div>

                        <Show when={createMutation.isError}>
                            <div class="alert alert-error mt-2">
                                <div>{(createMutation.error as any)?.message ?? "创建失败"}</div>
                            </div>
                        </Show>
                    </div>
                </div>
            </div>
        </Show>
    );
}
