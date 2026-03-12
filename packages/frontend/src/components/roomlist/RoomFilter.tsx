/**
 * RoomFilter.tsx
 *
 * Controlled filter UI for room list.
 * Emits Partial<ListGamesQuery> to parent.
 */

import { type Component, createSignal, createEffect, Show } from "solid-js";
import type { ListGamesQuery } from "@generale/types/dist/api";

type Props = {
  value: Partial<ListGamesQuery>;
  onChange: (next: Partial<ListGamesQuery>) => void;
};

// simple debounce
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 250) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export const RoomFilter: Component<Props> = (props) => {
  const [local, setLocal] = createSignal<Partial<ListGamesQuery>>({
    ...props.value
  });

  const [customWidth, setCustomWidth] = createSignal("");
  const [customHeight, setCustomHeight] = createSignal("");

  const emit = debounce((v: Partial<ListGamesQuery>) => props.onChange(v));

  // sync parent → local
  createEffect(() => {
    setLocal({ ...(props.value ?? {}) });
  });

  function setField<K extends keyof ListGamesQuery>(
    key: K,
    value: string | undefined
  ) {
    setLocal(prev => {
      const next = {
        ...prev,
        [key]: value === "" || value === undefined ? undefined : value
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
    <div class="card p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* room name */}
        <input
          class="input input-sm w-full"
          placeholder="Room name"
          value={local().roomName ?? ""}
          onInput={(e) => setField("roomName", e.currentTarget.value)}
        />

        {/* host name */}
        <input
          class="input input-sm w-full"
          placeholder="Host name"
          value={local().hostName ?? ""}
          onInput={(e) => setField("hostName", e.currentTarget.value)}
        />

        {/* mode / status / password */}
        <div class="flex gap-2">
          <select
            class="select select-sm"
            value={local().type ?? ""}
            onChange={(e) => setField("type", e.currentTarget.value)}
          >
            <option value="">All modes</option>
            <option value="standard">standard</option>
            <option value="custom">custom</option>
          </select>

          <select
            class="select select-sm"
            value={local().status ?? ""}
            onChange={(e) => setField("status", e.currentTarget.value)}
          >
            <option value="">Any status</option>
            <option value="lobby">lobby</option>
            <option value="in-progress">in-progress</option>
            <option value="finished">finished</option>
          </select>

          <select
            class="select select-sm"
            value={local().hasPassword ?? ""}
            onChange={(e) => setField("hasPassword", e.currentTarget.value)}
          >
            <option value="">Any lock</option>
            <option value="true">Locked</option>
            <option value="false">Unlocked</option>
          </select>
        </div>

        {/* players + map */}
        <div class="flex gap-2 items-center">
          <input
            type="number"
            class="input input-sm"
            placeholder="min players"
            value={local().minPlayers ?? ""}
            onInput={(e) => setField("minPlayers", e.currentTarget.value)}
          />

          <input
            type="number"
            class="input input-sm"
            placeholder="max players"
            value={local().maxPlayers ?? ""}
            onInput={(e) => setField("maxPlayers", e.currentTarget.value)}
          />

          {/* map filter */}
          <Show when={local().type === "standard"}>
            <select
              class="select select-sm"
              value={local().map ?? ""}
              onChange={(e) => setField("map", e.currentTarget.value)}
            >
              <option value="">Any map</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
          </Show>

          <Show when={local().type === "custom"}>
            <div class="flex items-center gap-1">
              <input
                type="number"
                min={10}
                max={500}
                class="input input-sm w-20"
                placeholder="W"
                value={customWidth()}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setCustomWidth(v);
                  setCustomMap(v, undefined);
                }}
              />
              <span>×</span>
              <input
                type="number"
                min={10}
                max={500}
                class="input input-sm w-20"
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
          <select
            class="select select-sm"
            value={local().sortBy ?? ""}
            onChange={(e) => setField("sortBy", e.currentTarget.value)}
          >
            <option value="">Sort by</option>
            <option value="playerCount">playerCount</option>
            <option value="roomName">roomName</option>
            <option value="maxPlayers">maxPlayers</option>
            <option value="status">status</option>
          </select>

          <select
            class="select select-sm"
            value={local().sortOrder ?? "desc"}
            onChange={(e) => setField("sortOrder", e.currentTarget.value)}
          >
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>

          <button class="btn btn-sm" onClick={clearAll}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomFilter;