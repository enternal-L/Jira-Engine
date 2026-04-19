import { useCallback, useEffect, useRef, useState } from 'react'
import {
  debugLogMemfsState,
  syncResourcesFolderToMemfs,
  type EmscriptenFS,
  type EmscriptenFSWithTreeOps,
} from '../emscripten/mountResourcesFs'

/** MEMFS tree logged in debug (only `resources/` is synced for Run). */
const MEMFS_DEBUG_TREE_ROOT = '/resources'

/** Emscripten MODULARIZE module factory (see game_engine Makefile EXPORT_NAME). */
type CreateGameEngine = (moduleArg: {
  canvas: HTMLCanvasElement
  print?: (text: string) => void
  printErr?: (text: string) => void
  onAbort?: (reason?: unknown) => void
  noInitialRun?: boolean
  /**
   * Resolve `game_engine.wasm` (and any companion assets) under `/wasm/`.
   * Required in dev so relative fetches do not hit the page origin by mistake.
   */
  locateFile?: (path: string, scriptDirectory?: string) => string
}) => Promise<EmscriptenModuleHandle>

type EmscriptenModuleHandle = {
  FS: EmscriptenFS
  callMain: (args: string[]) => unknown
  _SDL_quit?: () => unknown
}

const MAX_LOG_LINES = 400

/** Backing size for SDL / WebGL; larger than 800×600 for a bigger preview. */
const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 720

export type EngineCanvasProps = {
  /**
   * Snapshot of the React workspace (`path → bytes`). On Run, only `resources/...` entries
   * are copied to MEMFS `/resources/...` before `callMain`. Null/omitted = empty resources tree.
   */
  customResources?: Map<string, Uint8Array> | null
  /** Tight layout for split view with the resource IDE (full viewport). */
  embed?: boolean
}

export function EngineCanvas({
  customResources = null,
  embed = false,
}: EngineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const moduleHandleRef = useRef<EmscriptenModuleHandle | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [wasmLog, setWasmLog] = useState<string[]>([])

  const appendWasmLog = useCallback((prefix: string, text: unknown) => {
    const s = text == null ? '' : String(text)
    const lines = s.length === 0 ? [''] : s.split(/\r?\n/)
    setWasmLog((prev) => {
      const next = [...prev, ...lines.map((line) => `${prefix} ${line}`)]
      return next.slice(-MAX_LOG_LINES)
    })
  }, [])

  useEffect(() => {
    const maybeCanvas = canvasRef.current
    if (!maybeCanvas) {
      return
    }
    const canvasEl: HTMLCanvasElement = maybeCanvas

    let cancelled = false

    async function run() {
      setStatus('loading')
      setErrorMessage(null)
      setWasmLog([])
      try {
        const wasmOriginBase = window.location.origin + import.meta.env.BASE_URL
        const wasmModuleUrl = new URL('wasm/game_engine.mjs', wasmOriginBase).href

        // filled with other keys from the mjs file
        const mod = (await import(/* @vite-ignore */ wasmModuleUrl)) as {
          default: CreateGameEngine
        }

        if (cancelled) {
          return
        }

        const emModuleConfig = {
          canvas: canvasEl,
          noInitialRun: true,

          // used to locate the correct file
          locateFile(path: string) {
            return new URL(`wasm/${path}`, wasmOriginBase).href
          },

          print: (t: string) => {
            console.log('[stdout]', t)
          },

          printErr: (t: string) => {
            console.log('[stderr]', t)
          },

          onAbort: (reason?: unknown) => {
            const msg =
              reason !== undefined && reason !== null
                ? String(reason)
                : 'WASM aborted (see stderr above)'
            appendWasmLog('[abort]', msg)
            setErrorMessage(msg)
            setStatus('error')
          },
        }

        // set ref
        const moduleHandle = await mod.default(emModuleConfig)
        moduleHandleRef.current = moduleHandle

        if (cancelled) {
          return
        }

        // memfs
        const fs = moduleHandle.FS as EmscriptenFSWithTreeOps

        // set to react file tree state
        const uploadMap = customResources ?? new Map<string, Uint8Array>()

        // syncing
        syncResourcesFolderToMemfs(fs, uploadMap)
        
        // debugging purposes
        // debugLogMemfsState(
        //   'before callMain',
        //   memfsResources,
        //   fs,
        //   MEMFS_DEBUG_TREE_ROOT,
        //   (msg) => appendWasmLog('[fs]', msg),
        // )

        moduleHandle.callMain([])

        if (!cancelled) {
          setStatus('ready')
        }
      } catch (e) {
        if (cancelled) {
          return
        }
        setStatus('error')
        const msg =
          e instanceof Error
            ? e.message
            : 'Failed to load or start WASM. Build from game_engine_marvincs: make wasm'
        setErrorMessage(msg)
        appendWasmLog('[catch]', msg)
      }
    }

    void run()

    return () => {
      cancelled = true
      const moduleHandle = moduleHandleRef.current
      moduleHandleRef.current = null

      if (!moduleHandle) {
        return
      }
      try {
        moduleHandle._SDL_quit?.()
      } catch {
        // Engine may already be exiting; ignore teardown errors.
      }
    }
  }, [appendWasmLog, customResources])

  const shell = embed
    ? 'flex h-full min-h-0 w-full flex-1 flex-col gap-2 overflow-auto p-1'
    : 'flex w-full max-w-5xl flex-col gap-4'
  const canvasWrap = embed
    ? 'flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 p-1'
    : 'overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl'
  const canvasClass = embed
    ? 'block h-auto max-h-[min(92svh,920px)] w-full max-w-full bg-zinc-950 object-contain'
    : 'block max-h-[80svh] w-full bg-zinc-950'

  return (
    <div className={shell}>
      <div className={canvasWrap}>
        <canvas
          ref={canvasRef}
          id="canvas"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={canvasClass}
          tabIndex={-1}
        />
      </div>
      {status === 'loading' && (
        <p className="text-sm text-zinc-400">Loading WebAssembly…</p>
      )}
      {errorMessage && (
        <p className="rounded border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-100">
          <span className="font-medium">Error: </span>
          {errorMessage}
        </p>
      )}
      {wasmLog.length > 0 && (
        <details
          className={`rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-left ${embed ? 'max-h-36 shrink-0' : ''}`}
          open
        >
          <summary className="cursor-pointer text-sm font-medium text-zinc-300">
            Engine output (stdout / stderr from Emscripten)
          </summary>
          <pre
            className={`mt-2 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs text-zinc-400 ${embed ? 'max-h-28' : 'max-h-64'}`}
          >
            {wasmLog.join('\n')}
          </pre>
        </details>
      )}
      {status === 'error' && !errorMessage && (
        <p className="rounded border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          Could not load <code className="text-xs">game_engine.mjs</code> /{' '}
          <code className="text-xs">game_engine.wasm</code>. From{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">
            game_engine_marvincs/
          </code>{' '}
          run{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">make wasm</code>{' '}
          (requires <code className="text-xs">em++</code> on PATH). Minimal SDL
          demo:{' '}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">
            ./emscripten_demo/build.sh
          </code>
          .
        </p>
      )}
    </div>
  )
}
