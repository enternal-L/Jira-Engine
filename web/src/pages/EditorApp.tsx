import { useCallback, useEffect, useRef, useState } from 'react'
import { EngineCanvas } from '../components/EngineCanvas'
import { ResourcePanel } from '../components/ResourcePanel'
import {
  fetchPublicResourcesTree,
  fetchPublicRootFile,
} from '../emscripten/loadPublicResources'
import {
  createEmptyWorkspace,
  createWorkspaceFromResourceMap,
  workspaceToResourceMap,
  type ResourceWorkspace,
} from '../emscripten/resourceWorkspace'

function IconPlay() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}

function IconStop() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6h12v12H6V6z" />
    </svg>
  )
}

function useResizableSidebarWidth() {
  const [leftPx, setLeftPx] = useState(() => {
    if (typeof window === 'undefined') {
      return 480
    }
    return Math.min(640, Math.max(300, Math.floor(window.innerWidth * 0.48)))
  })

  const drag = useRef<{ active: boolean; startX: number; startW: number }>({
    active: false,
    startX: 0,
    startW: 0,
  })

  const onGripMouseDown = useCallback(
    (e: React.MouseEvent) => {
      drag.current = { active: true, startX: e.clientX, startW: leftPx }
      e.preventDefault()
    },
    [leftPx],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current.active) {
        return
      }
      const delta = e.clientX - drag.current.startX
      const next = drag.current.startW + delta
      const min = 220
      const max = Math.floor(window.innerWidth * 0.78)
      setLeftPx(Math.min(max, Math.max(min, next)))
    }
    const onUp = () => {
      drag.current.active = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return { leftPx, onGripMouseDown }
}

export default function EditorApp() {
  /** Workspace root = `/`; on Run only `resources/...` is pushed to wasm MEMFS. */
  const [workspace, setWorkspace] = useState<ResourceWorkspace | null>(null)
  const [runResources, setRunResources] = useState<Map<string, Uint8Array> | null>(
    null,
  )
  const [engineRunning, setEngineRunning] = useState(false)
  const [engineKey, setEngineKey] = useState(0)

  const { leftPx, onGripMouseDown } = useResizableSidebarWidth()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const base = import.meta.env.BASE_URL
      const baseNorm = base.endsWith('/') ? base : `${base}/`
      try {
        const map = await fetchPublicResourcesTree(baseNorm)
        if (cancelled) {
          return
        }
        const starter = await fetchPublicRootFile(baseNorm, 'starter.txt')
        if (cancelled) {
          return
        }
        if (starter) {
          map.set('starter.txt', starter)
        }
        setWorkspace((prev) => {
          if (prev !== null) {
            return prev
          }
          if (map.size === 0) {
            return createEmptyWorkspace()
          }
          return createWorkspaceFromResourceMap(map)
        })
      } catch {
        if (!cancelled) {
          setWorkspace((prev) =>
            prev !== null ? prev : createEmptyWorkspace(),
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const bumpEngine = useCallback(() => {
    setEngineKey((k) => k + 1)
  }, [])

  const runEngine = useCallback(() => {

    // gets snapshot of current react filetree
    const snapshot = workspaceToResourceMap(workspace)

    // sets state to snapshot
    setRunResources(snapshot)

    // cpp API set engine running to true
    setEngineRunning(true)

    // set engine instance
    bumpEngine()
  }, [bumpEngine, workspace])

  const stopEngine = useCallback(() => {
    setEngineRunning(false)
    setEngineKey((k) => k + 1)
  }, [])

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <main className="flex min-h-0 flex-1">
        <div
          className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden"
          style={{ width: leftPx }}
        >
          <ResourcePanel
            className="h-full min-h-0 flex-1 rounded-none border-0"
            workspace={workspace}
            onWorkspaceChange={setWorkspace}
          />
        </div>

        <button
          type="button"
          aria-label="Resize panels"
          className="group h-full w-1.5 shrink-0 cursor-col-resize border-0 bg-zinc-800 p-0 hover:bg-gray-300"
          onMouseDown={onGripMouseDown}
        />

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
          <div className="flex shrink-0 items-center justify-between gap-2 bg-[#252526] px-3 py-2 pl-4">
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {engineRunning ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-red-800/80 bg-red-950/40 px-3 text-[13px] font-medium text-red-200 hover:bg-red-900/50"
                  onClick={stopEngine}
                  title="Stop engine"
                  aria-label="Stop engine"
                >
                  Stop
                  <IconStop />
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-800/80 bg-emerald-950/50 px-3 text-[13px] font-medium text-emerald-200 hover:bg-emerald-900/60"
                  onClick={runEngine}
                  title="Run engine"
                  aria-label="Run engine"
                >
                  Run
                  <IconPlay />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {engineRunning ? (
              <EngineCanvas
                key={engineKey}
                embed
                customResources={runResources}
              />
            ) : (
              <div className="flex h-full flex-1 items-center justify-center px-4 text-center text-sm text-zinc-500">
                Press Run to start the engine. Stop returns you to editing.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
