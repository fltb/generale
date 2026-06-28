# Task 5 Report: Complex Components

## Files Created

| # | File | Tests | Status |
|---|------|-------|--------|
| 1 | `src/components/__tests__/MapRender.test.tsx` | 4 | PASS |
| 2 | `src/components/__tests__/MapTile.test.tsx` | 4 | PASS |
| 3 | `src/components/__tests__/game/Game.test.tsx` | 5 | PASS |
| 4 | `src/components/__tests__/game/PlayerList.test.tsx` | 4 | PASS |
| 5 | `src/components/__tests__/room/ConnectedRoom.test.tsx` | 2 | PASS |
| 6 | `src/components/__tests__/room/Room.test.tsx` | 5 | PASS |

## Mocking Strategy

### MapRender / MapTile
- `solid-pixi` mocked to render children or return null for `Application`, `Container`, `Graphics`, `Text`
- `pixi.js` mocked with stub `Graphics` returning chainable methods (`.clear()`, `.rect()`, `.stroke()`, `.fill()`)
- `faIconGraphic` factory returns stubbed `createScaledIcon` / `destroy`
- `useMapInput` returns `active` signal and `handleTileClick` stub
- `MapTile` sub-component mocked to null

### Game
- `useGameSession` returns full mock controller with signals returning `mockState`
- `solid-pixi` + `pixi.js` mocks as above
- `@solidjs/router` mocks for `useNavigate` and `A`
- `~/ui` mocks for all UI primitives (`Badge`, `Button`, `Confetti`, `Countdown`, `Overlay`, `sfx`, `TakeoverOverlay`)

### PlayerList (game)
- Router mocked, Avatar sub-component mocked to null
- Uses real `playerSummaries` selector + `resolveDisplayNames` from source

### ConnectedRoom
- `usePreGameRoom` returns full mock controller
- Room sub-components (`PlayerList`, `PreGameControls`, `PreGameMapSettingForm`, `StateForm`) mocked to null

### RoomWithSync
- `PregameController` injected directly via `ctrl` prop
- Sub-components mocked to null via `~/` alias paths

## Key Observations
- `solid-pixi` Application creates PIXI app asynchronously via `createResource`; mocking must render `children` inside the mock
- `onMount` runs synchronously in test environment, triggering `onViewportReady` callback
- Room rendering depends on `StateForm` which imports `Range` from `~/ui`; all `~/ui` mocks must export `Range`
- Component `display: none` visibility controlled via `wrapperStyle()` accessor wrapping
