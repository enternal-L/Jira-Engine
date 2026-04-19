# WebAssembly output

**Game engine** (from `game_engine_marvincs/`):

```bash
cd ../..
make -C game_engine_marvincs wasm
# or from web/: npm run build:wasm
```

Outputs `game_engine.mjs` and `game_engine.wasm`. Optional: `make wasm PRELOAD_TEXT_FILE=wasm_preload_note.txt` embeds that file at `/resources/_wasm_preload.txt` (see `game_engine_marvincs/Makefile`). Otherwise MEMFS `/resources` is filled from the web app at runtime.

**Minimal SDL demo** (optional):

```bash
./emscripten_demo/build.sh
```

Outputs `engine_demo.mjs` / `engine_demo.wasm` — switch `EngineCanvas.tsx` to `wasm/engine_demo.mjs` if you use only the demo.

Requires [Emscripten](https://emscripten.org/) (`em++` on `PATH` after `source emsdk_env.sh`).
