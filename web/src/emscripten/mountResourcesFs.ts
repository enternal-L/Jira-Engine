/**
 * Emscripten MEMFS helpers: write the workspace `resources/` tree into MEMFS before `callMain`.
 * Only paths under `resources/...` are synced to `/resources/...` (engine-relative paths).
 * Other workspace files (e.g. `starter.txt`) stay in the editor only.
 */

/** Set to `false` to silence MEMFS debug logging. */
export const DEBUG_MEMFS = true

export type EmscriptenFS = {
  mkdirTree: (path: string) => void
  writeFile: (
    path: string,
    data: string | Uint8Array | ArrayBufferView,
  ) => void
}

export type EmscriptenFSWithTreeOps = EmscriptenFS & {
  readdir: (path: string) => string[]
  stat: (path: string, dontFollow?: boolean) => { mode: number; size?: number }
  unlink: (path: string) => void
  rmdir: (path: string) => void
  isDir: (mode: number) => boolean
}

export function normalizeRelativePath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
}

const WORKSPACE_RESOURCES_PREFIX = 'resources/'

/**
 * Copy only the workspace `resources/` subtree to MEMFS `/resources/...`.
 * Clears `/resources` first, then writes each matching file. Returns the map actually written.
 */
export function syncResourcesFolderToMemfs(
  fs: EmscriptenFSWithTreeOps,
  files: Map<string, Uint8Array>,
): Map<string, Uint8Array> {
  clearMemfsSubtree(fs, '/resources')
  ensureMemfsDir(fs, '/resources')

  const written = new Map<string, Uint8Array>()
  for (const [rel, data] of files) {
    const norm = normalizeRelativePath(rel)
    if (!norm || norm.endsWith('/')) {
      continue
    }
    if (!norm.startsWith(WORKSPACE_RESOURCES_PREFIX)) {
      continue
    }
    const full = `/${norm}`.replace(/\/+/g, '/')
    const slash = full.lastIndexOf('/')
    const dir = slash > 0 ? full.slice(0, slash) : ''
    if (dir.length > 0) {
      fs.mkdirTree(dir)
    }
    fs.writeFile(full, data)
    written.set(norm, data)
  }
  return written
}

function normalizeAbsDir(path: string): string {
  const t = path.replace(/\/+/g, '/').replace(/\/+$/, '')
  return t.length === 0 ? '/' : t
}

/** Ensure an absolute MEMFS directory exists (creates parents). */
export function ensureMemfsDir(fs: EmscriptenFS, absPath: string): void {
  fs.mkdirTree(normalizeAbsDir(absPath))
}

export function clearMemfsSubtree(fs: EmscriptenFSWithTreeOps, root: string): void {
  const base = normalizeAbsDir(root)
  let names: string[]
  try {
    names = fs.readdir(base)
  } catch {
    return
  }
  for (const name of names) {
    if (name === '.' || name === '..') {
      continue
    }
    const full = `${base}/${name}`.replace(/\/+/g, '/')

    const st = fs.stat(full)
    if (fs.isDir(st.mode)) {
      clearMemfsSubtree(fs, full)
      fs.rmdir(full)
    } else {
      fs.unlink(full)
    }
  }
}

/** Read every file from a `<input webkitdirectory>` (or multi-file) `FileList`. */
export async function readFileListAsMap(
  fileList: FileList | null,
): Promise<Map<string, Uint8Array>> {
  const map = new Map<string, Uint8Array>()
  if (!fileList || fileList.length === 0) {
    return map
  }
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList.item(i)
    if (!file) {
      continue
    }
    const rel = normalizeRelativePath(file.webkitRelativePath || file.name)
    if (!rel || rel.endsWith('/')) {
      continue
    }
    const buf = new Uint8Array(await file.arrayBuffer())
    map.set(rel, buf)
  }
  return map
}

/**
 * Place uploads under the editor’s current folder: each key becomes
 * `prefix/key` (empty prefix = workspace root).
 */
export function prefixPathMap(
  folderPrefix: string,
  files: Map<string, Uint8Array>,
): Map<string, Uint8Array> {
  const prefix = normalizeRelativePath(folderPrefix).replace(/\/+$/, '')
  if (!prefix) {
    return new Map(files)
  }
  const out = new Map<string, Uint8Array>()
  for (const [k, v] of files) {
    const nk = `${prefix}/${normalizeRelativePath(k)}`.replace(/\/+/g, '/')
    out.set(nk, v)
  }
  return out
}

/** Human-readable tree for debug output. */
export function formatMemfsTreeString(
  fs: EmscriptenFSWithTreeOps,
  root: string,
): string {
  const lines: string[] = []

  function walk(path: string, prefix: string): void {
    let names: string[]
    try {
      names = fs.readdir(path)
    } catch {
      lines.push(`${prefix}[unreadable: ${path}]`)
      return
    }
    const sorted = names
      .filter((n) => n !== '.' && n !== '..')
      .sort((a, b) => a.localeCompare(b))
    for (const name of sorted) {
      const full = `${path}/${name}`.replace(/\/+/g, '/')
      const st = fs.stat(full)
      if (fs.isDir(st.mode)) {
        lines.push(`${prefix}${name}/`)
        walk(full, `${prefix}  `)
      } else {
        const sz = typeof st.size === 'number' ? st.size : 0
        lines.push(`${prefix}${name}  (${sz} bytes)`)
      }
    }
  }

  const abs = normalizeAbsDir(root)
  walk(abs, '')
  return lines.length > 0 ? lines.join('\n') : '  (empty)'
}

export function logMemfsTree(
  fs: EmscriptenFSWithTreeOps,
  root: string,
  log: typeof console.log = console.log,
): void {
  const abs = normalizeAbsDir(root)
  log(`[memfs debug] tree: ${abs}`)
  log(formatMemfsTreeString(fs, root))
}

export function debugLogMemfsState(
  label: string,
  files: Map<string, Uint8Array>,
  fs: EmscriptenFSWithTreeOps,
  memfsRoot: string,
  mirrorLog?: (msg: string) => void,
): void {
  if (!DEBUG_MEMFS) {
    return
  }
  const out = (msg: string) => {
    console.log(msg)
    mirrorLog?.(msg)
  }
  const keys = [...files.keys()].sort((a, b) => a.localeCompare(b))
  out(`[memfs debug] --- ${label}: workspace → MEMFS (${keys.length} paths) ---`)
  out(keys.length > 0 ? keys.join('\n') : '  (empty)')
  logMemfsTree(fs, memfsRoot, out)
}
