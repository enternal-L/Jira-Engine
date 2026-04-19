# Jira + C++ Game Engine

Jira is a browser-based editor and runner for a custom C++ 2D game engine.  
You edit project resources in the web UI, press **Run**, and the app launches the WebAssembly build of the engine in-canvas.

## What Jira Does

- Provides a file/resource workspace UI (`web/`) for engine assets and scripts.
- Lets you create/edit/upload files and folders used by the engine.
- Starts the wasm engine and shows stdout/stderr logs in the app.

## What the Engine Does

- Core runtime in `game_engine_marvincs/` (C++17 + SDL + Lua + Box2D).
- Loads configs/scenes/components from `resources/...`.
- Renders and runs game loop natively or as WebAssembly.

## Project Layout

- `web/` - React + Vite frontend (editor + wasm host).
- `game_engine_marvincs/` - game engine source and Makefile for native/wasm builds.
- `web/public/wasm/` - generated wasm artifacts consumed by the web app.
- `web/public/resources/` - sample/default resources loaded by the web app.

## Runtime Flow (High Level)

1. Web editor captures workspace files as a map (`path -> bytes`).
2. On Run, only paths under `resources/...` are synced into Emscripten MEMFS at `/resources/...`.
3. Web app loads `wasm/game_engine.mjs`, then calls `callMain([])`.
4. Engine `main` runs and uses `resources/...` paths in MEMFS.

## Prerequisites

- Node.js + npm (for `web/`).
- Emscripten SDK activated in your shell (for wasm engine builds).
- C++ toolchain/SDL deps if building native target.

## Quick Start

### 1) Build engine wasm

```bash
cd game_engine_marvincs
source ~/emsdk/emsdk/emsdk_env.sh
make wasm
```

This writes `game_engine.mjs/.wasm` to `web/public/wasm/`.

### 2) Start web app

```bash
cd web
npm install
npm run dev
```

Open the local Vite URL, then press **Run** in the UI.

## Resource Conventions

- Engine expects core files such as:
  - `resources/game.config`
  - `resources/scenes/*.scene`
  - `resources/component_types/*.lua`
  - `resources/actor_templates/*.template`
  - `resources/images/<name>.png`
- Files outside `resources/...` are not synced into engine MEMFS for runtime.

