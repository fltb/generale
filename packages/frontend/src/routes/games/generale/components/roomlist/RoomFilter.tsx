/**
 * RoomFilter.tsx
 *
 * Controlled filter UI for room list.
 * Emits Partial<ListGamesQuery> to parent.
 */

import type { ListGamesQuery } from "@generale/types/dist/api";
import { type Component, createEffect, createSignal, Show } from "solid-js";
import { Button, Card, Input, Select } from "~/ui";
import { useT } from "~/i18n/useT";

type Props = {
  value: Partial<ListGamesQuery>;
  onChange: (next: Partial<ListGamesQuery>) => void;
};

// simple debounce
function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 250) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export const RoomFilter: Component<Props> = (props) => {
  const { t } = useT();
  const [local, setLocal] = createSignal<Partial<ListGamesQuery>>({
    ...props.value,
  });

  const [customWidth, setCustomWidth] = createSignal("");
  const [customHeight, setCustomHeight] = createSignal("");

  const emit = debounce((v: Partial<ListGamesQuery>) => props.onChange(v));

  // sync parent → local
  createEffect(() => {
    setLocal({ ...(props.value ?? {}) });
  });

  function setField<K extends keyof ListGamesQuery>(key: K, value: string | undefined) {
    setLocal((prev) => {
      const next = {
        ...prev,
        [key]: value === "" || value === undefined ? undefined : value,
      };

      // type change resets map
      if (key === "type") {
        next.map = undefined;
        setCustomWidth("");
        setCustomHeight("");
      }

      emit(next);
      return next;
    });
  }

  function setCustomMap(w?: string, h?: string) {
    const width = w ?? customWidth();
    const height = h ?? customHeight();

    if (width && height) {
      setField("map", `${width}x${height}`);
    } else {
      setField("map", undefined);
    }
  }

  function clearAll() {
    setLocal({});
    setCustomWidth("");
    setCustomHeight("");
    props.onChange({});
  }

  return (
    <Card class="p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* room name */}
        <Input
          size="sm"
          class="w-full"
          placeholder={t("Room name")}
          value={local().roomName ?? ""}
          onInput={(e) => setField("roomName", e.currentTarget.value)}
        />

        {/* host name */}
        <Input
          size="sm"
          class="w-full"
          placeholder={t("Host name")}
          value={local().hostName ?? ""}
          onInput={(e) => setField("hostName", e.currentTarget.value)}
        />

        {/* mode / status / password */}
        <div class="flex gap-2">
          <Select size="sm" value={local().type ?? ""} onChange={(e) => setField("type", e.currentTarget.value)}>
            <option value="">{t("All modes")}</option>
            <option value="standard">{t("standard")}</option>
            <option value="custom">{t("custom")}</option>
          </Select>

          <Select size="sm" value={local().status ?? ""} onChange={(e) => setField("status", e.currentTarget.value)}>
            <option value="">{t("Any status")}</option>
            <option value="lobby">{t("lobby")}</option>
            <option value="in-progress">{t("in-progress")}</option>
            <option value="finished">{t("finished")}</option>
          </Select>

          <Select
            size="sm"
            value={local().hasPassword ?? ""}
            onChange={(e) => setField("hasPassword", e.currentTarget.value)}
          >
            <option value="">{t("Any lock")}</option>
            <option value="true">{t("Locked")}</option>
            <option value="false">{t("Unlocked")}</option>
          </Select>
        </div>

        {/* players + map */}
        <div class="flex gap-2 items-center">
          <Input
            type="number"
            size="sm"
            placeholder={t("min players")}
            value={local().minPlayers ?? ""}
            onInput={(e) => setField("minPlayers", e.currentTarget.value)}
          />

          <Input
            type="number"
            size="sm"
            placeholder={t("max players")}
            value={local().maxPlayers ?? ""}
            onInput={(e) => setField("maxPlayers", e.currentTarget.value)}
          />

          {/* map filter */}
          <Show when={local().type === "standard"}>
            <Select size="sm" value={local().map ?? ""} onChange={(e) => setField("map", e.currentTarget.value)}>
              <option value="">{t("Any map")}</option>
              <option value="small">{t("small")}</option>
              <option value="medium">{t("medium")}</option>
              <option value="large">{t("large")}</option>
            </Select>
          </Show>

          <Show when={local().type === "custom"}>
            <div class="flex items-center gap-1">
              <Input
                type="number"
                min={10}
                max={500}
                size="sm"
                class="w-20"
                placeholder={t("W")}
                value={customWidth()}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setCustomWidth(v);
                  setCustomMap(v, undefined);
                }}
              />
              <span>×</span>
              <Input
                type="number"
                min={10}
                max={500}
                size="sm"
                class="w-20"
                placeholder={t("H")}
                value={customHeight()}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setCustomHeight(v);
                  setCustomMap(undefined, v);
                }}
              />
            </div>
          </Show>
        </div>

        {/* sort */}
        <div class="flex gap-2 items-center">
          <Select size="sm" value={local().sortBy ?? ""} onChange={(e) => setField("sortBy", e.currentTarget.value)}>
            <option value="">{t("Sort by")}</option>
            <option value="playerCount">{t("playerCount")}</option>
            <option value="roomName">{t("roomName")}</option>
            <option value="maxPlayers">{t("maxPlayers")}</option>
            <option value="status">{t("status")}</option>
          </Select>

          <Select
            size="sm"
            value={local().sortOrder ?? "desc"}
            onChange={(e) => setField("sortOrder", e.currentTarget.value)}
          >
            <option value="desc">{t("desc")}</option>
            <option value="asc">{t("asc")}</option>
          </Select>

          <Button size="sm" onClick={clearAll}>
            {t("Clear")}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default RoomFilter;
