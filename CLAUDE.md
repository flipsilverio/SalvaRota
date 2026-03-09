# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run web        # Run web version
npm run lint       # Run ESLint
```

No test runner is configured. To reset the project to a blank slate: `npm run reset-project`

## Environment

Set `EXPO_PUBLIC_MAPTILER_API_KEY` for the map screen to render tiles.

## Architecture

**Expo Router (file-based routing)** — all routes live in `app/`. The `(tabs)` folder creates the bottom tab group. `_layout.tsx` files define navigation structure at each level.

**Two main screens:**
- `app/(tabs)/index.tsx` — Map screen using MapLibre GL centered on Rio de Janeiro, with a `@gorhom/bottom-sheet` drawer
- `app/(tabs)/explore.tsx` — Example/tutorial screen with collapsible sections

**Theme system** — `constants/theme.ts` defines light/dark color tokens. `useColorScheme()` detects system theme; `useThemeColor()` resolves theme-aware colors. `ThemedText` and `ThemedView` in `components/` wrap native elements with automatic theming.

**Platform-specific files** — `.ios.tsx` and `.web.ts` suffixes are used for platform overrides (e.g., `icon-symbol.ios.tsx`, `use-color-scheme.web.ts`).

**Path alias** — `@/*` maps to the project root (configured in `tsconfig.json`).

**New Architecture** and **React Compiler** are both enabled (`app.json`).
