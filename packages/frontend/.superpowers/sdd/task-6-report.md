# Task 6 Report: Map Editor

## Files Created

| # | File | Tests | Status |
|---|------|-------|--------|
| 7 | `src/components/__tests__/map-editor/MapEditor.test.tsx` | 6 | PASS |
| 8 | `src/components/__tests__/map-editor/MapPreview.test.tsx` | 4 | PASS |
| 9 | `src/components/__tests__/map-editor/MapSelector.test.tsx` | 4 | PASS |

## Mocking Strategy

### MapEditor
- `solid-pixi` mocked to render children / return null (same pattern as MapRender)
- `pixi.js` mocked with stub `Application`, `Graphics`, `Container`, `Text`
- `~/api/mapApi`: all API functions (`createMapApi`, `updateMapApi`, `mapDetailApi`, `discardDraftApi`, `uploadMapThumbnailApi`) return resolved/rejected promises
- `~/ui`: `Button` renders children in `<button>`, `Input` renders `<input>`
- `@solidjs/router`: `A` renders `<a>`, `useNavigate` returns stub
- `MapTile` sub-component mocked to null
- `faIconGraphic` factory stubbed
- `solid-js` `onMount` overridden to execute synchronously (needed for API call effects)

### MapPreview
- Same `solid-pixi` + `pixi.js` mocks
- `mapDetailApi` returns resolved data with 10×10 plain tile grid
- `onMount` overridden to execute synchronously for async map loading
- Tests verify loading state → loaded state transition via `waitFor`

### MapSelector
- `listMapsApi` returns mock map list with 2 entries
- `mapThumbnailUrl` returns constructed URL
- `~/ui`: all exports stubbed (`Collapse`, `CollapseContent`, `CollapseTitle`, `Checkbox`, `Input`, `Button`, `Spinner`)
- No PixiJS mocking needed (no canvas rendering)

## Key Observations
- `MapEditor` is a default export function (not a named export), imported as `import MapEditor from "~/components/map-editor/MapEditor"`
- `MapSelector` is a named export `MapSelector`
- `onMount` with async functions needs special handling in tests — the mock calls `fn()` and if it returns a promise, awaits it
- `MapPreview` async load transitions from "加载中..." to showing the map name; tested with `waitFor`
- `MapSelector` is a pure DOM component (no PixiJS), making it the simplest to test
