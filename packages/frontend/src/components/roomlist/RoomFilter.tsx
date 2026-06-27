/**
 * RoomFilter.tsx
 *
 * Controlled filter UI for room list.
 * Emits Partial<ListGamesQuery> to parent.
 */

import type { ListGamesQuery } from "@generale/types/dist/api";
import { type Component, createEffect, createSignal, Show } from "solid-js";
import { Button, Card, Input, Select } from "~/ui";

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
          placeholder="Room name"
          value={local().roomName ?? ""}
          onInput={(e) => setField("roomName", e.currentTarget.value)}
        />

        {/* host name */}
        <Input
          size="sm"
          class="w-full"
          placeholder="Host name"
          value={local().hostName ?? ""}
          onInput={(e) => setField("hostName", e.currentTarget.value)}
        />

        {/* mode / status / password */}
        <div class="flex gap-2">
          <Select size="sm" value={local().type ?? ""} onChange={(e) => setField("type", e.currentTarget.value)}>
            <option value="">All modes</option>
            <option value="standard">standard</option>
            <option value="custom">custom</option>
          </Select>

          <Select size="sm" value={local().status ?? ""} onChange={(e) => setField("status", e.currentTarget.value)}>
            <option value="">Any status</option>
            <option value="lobby">lobby</option>
            <option value="in-progress">in-progress</option>
            <option value="finished">finished</option>
          </Select>

          <Select
            size="sm"
            value={local().hasPassword ?? ""}
            onChange={(e) => setField("hasPassword", e.currentTarget.value)}
          >
            <option value="">Any lock</option>
            <option value="true">Locked</option>
            <option value="false">Unlocked</option>
          </Select>
        </div>

        {/* players + map */}
        <div class="flex gap-2 items-center">
          <Input
            type="number"
            size="sm"
            placeholder="min players"
            value={local().minPlayers ?? ""}
            onInput={(e) => setField("minPlayers", e.currentTarget.value)}
          />

          <Input
            type="number"
            size="sm"
            placeholder="max players"
            value={local().maxPlayers ?? ""}
            onInput={(e) => setField("maxPlayers", e.currentTarget.value)}
          />

          {/* map filter */}
          <Show when={local().type === "standard"}>
            <Select size="sm" value={local().map ?? ""} onChange={(e) => setField("map", e.currentTarget.value)}>
              <option value="">Any map</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
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
                placeholder="W"
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
                placeholder="H"
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
            <option value="">Sort by</option>
            <option value="playerCount">playerCount</option>
            <option value="roomName">roomName</option>
            <option value="maxPlayers">maxPlayers</option>
            <option value="status">status</option>
          </Select>

          <Select
            size="sm"
            value={local().sortOrder ?? "desc"}
            onChange={(e) => setField("sortOrder", e.currentTarget.value)}
          >
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </Select>

          <Button size="sm" onClick={clearAll}>
            Clear
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default RoomFilter;
