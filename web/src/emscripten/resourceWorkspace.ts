export type ResourceFileKind = 'text' | 'binary'

export type ResourceWorkspaceFile = {
  path: string
  kind: ResourceFileKind
  bytes: Uint8Array
  mimeType?: string
}

export type ResourceWorkspace = {
  files: Map<string, ResourceWorkspaceFile>
  /** Explicit empty directories (normalized paths, no trailing slash). */
  emptyFolders: string[]
}

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'lua',
  'scene',
  'template',
  'templatem',
  'json',
  'cfg',
  'config',
  'md',
  'csv',
  'tsv',
  'xml',
  'yaml',
  'yml',
])

function normalizePath(raw: string): string {
  return raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
}

function sortUnique(paths: string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b))
}

function inferKind(path: string, mimeType?: string): ResourceFileKind {
  const lowerMime = (mimeType || '').toLowerCase()
  if (lowerMime.startsWith('text/')) {
    return 'text'
  }
  if (
    lowerMime.includes('json') ||
    lowerMime.includes('xml') ||
    lowerMime.includes('javascript')
  ) {
    return 'text'
  }

  const ext = path.toLowerCase().split('.').pop() || ''
  if (TEXT_FILE_EXTENSIONS.has(ext)) {
    return 'text'
  }
  return 'binary'
}

function pruneEmptyFolders(ws: ResourceWorkspace): ResourceWorkspace {
  const next = ws.emptyFolders.filter((folder) => {
    if (!folder) {
      return false
    }
    if (ws.files.has(folder)) {
      return false
    }
    const hasDescendant = [...ws.files.keys()].some((p) =>
      p.startsWith(`${folder}/`),
    )
    return !hasDescendant
  })
  return { ...ws, emptyFolders: sortUnique(next) }
}

export function createEmptyWorkspace(): ResourceWorkspace {
  return { files: new Map(), emptyFolders: [] }
}

export function createWorkspaceFromResourceMap(
  files: Map<string, Uint8Array>,
): ResourceWorkspace {
  const next = new Map<string, ResourceWorkspaceFile>()
  for (const [rawPath, bytes] of files) {
    const path = normalizePath(rawPath)
    if (!path || path.endsWith('/')) {
      continue
    }
    next.set(path, {
      path,
      kind: inferKind(path),
      bytes: new Uint8Array(bytes),
    })
  }
  return pruneEmptyFolders({ files: next, emptyFolders: [] })
}

/** Merge uploaded paths into an existing workspace (overwrites same paths; keeps the rest). */
export function mergeResourceMapIntoWorkspace(
  workspace: ResourceWorkspace,
  files: Map<string, Uint8Array>,
): ResourceWorkspace {
  const next = new Map(workspace.files)
  for (const [rawPath, bytes] of files) {
    const path = normalizePath(rawPath)
    if (!path || path.endsWith('/')) {
      continue
    }
    next.set(path, {
      path,
      kind: inferKind(path),
      bytes: new Uint8Array(bytes),
    })
  }
  return pruneEmptyFolders({
    files: next,
    emptyFolders: workspace.emptyFolders,
  })
}

export function workspaceToResourceMap(
  workspace: ResourceWorkspace | null,
): Map<string, Uint8Array> | null {
  if (!workspace) {
    return null
  }
  const out = new Map<string, Uint8Array>()
  for (const [path, file] of workspace.files) {
    out.set(path, new Uint8Array(file.bytes))
  }
  return out
}

export function listWorkspacePaths(workspace: ResourceWorkspace): string[] {
  return [...workspace.files.keys()].sort((a, b) => a.localeCompare(b))
}

export function getWorkspaceFile(
  workspace: ResourceWorkspace,
  path: string,
): ResourceWorkspaceFile | null {
  return workspace.files.get(normalizePath(path)) ?? null
}

export function getTextContent(
  workspace: ResourceWorkspace,
  path: string,
): string | null {
  const file = getWorkspaceFile(workspace, path)
  if (!file || file.kind !== 'text') {
    return null
  }
  return textDecoder.decode(file.bytes)
}

export function setTextContent(
  workspace: ResourceWorkspace,
  path: string,
  text: string,
): ResourceWorkspace {
  const norm = normalizePath(path)
  if (!norm || norm.endsWith('/')) {
    return workspace
  }
  const next = new Map(workspace.files)
  next.set(norm, {
    path: norm,
    kind: 'text',
    bytes: textEncoder.encode(text),
    mimeType: 'text/plain',
  })
  return pruneEmptyFolders({
    files: next,
    emptyFolders: workspace.emptyFolders,
  })
}

export function upsertBinaryFile(
  workspace: ResourceWorkspace,
  path: string,
  bytes: Uint8Array,
  mimeType?: string,
): ResourceWorkspace {
  const norm = normalizePath(path)
  if (!norm || norm.endsWith('/')) {
    return workspace
  }
  const next = new Map(workspace.files)
  next.set(norm, {
    path: norm,
    kind: inferKind(norm, mimeType),
    bytes: new Uint8Array(bytes),
    mimeType,
  })
  return pruneEmptyFolders({
    files: next,
    emptyFolders: workspace.emptyFolders,
  })
}

export function deleteWorkspacePath(
  workspace: ResourceWorkspace,
  path: string,
): ResourceWorkspace {
  const norm = normalizePath(path)
  const nextFiles = new Map(workspace.files)
  if (nextFiles.has(norm)) {
    nextFiles.delete(norm)
  } else {
    for (const key of [...nextFiles.keys()]) {
      if (key === norm || key.startsWith(`${norm}/`)) {
        nextFiles.delete(key)
      }
    }
  }
  const nextEmpty = workspace.emptyFolders.filter(
    (f) => f !== norm && !f.startsWith(`${norm}/`),
  )
  return pruneEmptyFolders({ files: nextFiles, emptyFolders: nextEmpty })
}

function joinUnderParent(parentPath: string, name: string): string {
  const p = normalizePath(parentPath)
  const n = normalizePath(name)
  if (!p) {
    return n
  }
  return `${p}/${n}`
}

function parentDir(fullPath: string): string {
  const n = normalizePath(fullPath)
  if (!n.includes('/')) {
    return ''
  }
  return n.slice(0, n.lastIndexOf('/'))
}

export function pathBasename(fullPath: string): string {
  const n = normalizePath(fullPath)
  if (!n.includes('/')) {
    return n
  }
  return n.slice(n.lastIndexOf('/') + 1)
}

/**
 * Rename a file or folder (last path segment only). Folders update all descendant paths.
 * Returns null if the path does not exist, the new name is invalid, or it would collide.
 */
export function renameWorkspaceEntry(
  workspace: ResourceWorkspace,
  oldPath: string,
  newName: string,
): ResourceWorkspace | null {
  const oldNorm = normalizePath(oldPath)
  const raw = newName.trim()
  if (!oldNorm || !raw) {
    return null
  }
  if (raw.includes('/') || raw.includes('\\')) {
    return null
  }
  if (raw === '.' || raw === '..') {
    return null
  }

  const parent = parentDir(oldNorm)
  const newFull = parent ? `${parent}/${raw}` : raw

  if (newFull === oldNorm) {
    return workspace
  }

  if (fileNameExists(workspace, newFull)) {
    return null
  }

  const isFile = workspace.files.has(oldNorm)
  const isEmptyFolderOnly = workspace.emptyFolders.includes(oldNorm)
  const hasChildPaths =
    [...workspace.files.keys()].some((p) => p.startsWith(`${oldNorm}/`)) ||
    workspace.emptyFolders.some((f) => f.startsWith(`${oldNorm}/`))

  if (isFile && !hasChildPaths && !isEmptyFolderOnly) {
    const file = workspace.files.get(oldNorm)!
    const next = new Map(workspace.files)
    next.delete(oldNorm)
    next.set(newFull, { ...file, path: newFull })
    return pruneEmptyFolders({
      files: next,
      emptyFolders: workspace.emptyFolders,
    })
  }

  if (isEmptyFolderOnly || hasChildPaths) {
    const nextFiles = new Map<string, ResourceWorkspaceFile>()
    for (const [p, f] of workspace.files) {
      if (p === oldNorm) {
        nextFiles.set(newFull, { ...f, path: newFull })
      } else if (p.startsWith(`${oldNorm}/`)) {
        const np = `${newFull}/${p.slice(oldNorm.length + 1)}`
        nextFiles.set(np, { ...f, path: np })
      } else {
        nextFiles.set(p, f)
      }
    }
    const nextEmpty = workspace.emptyFolders.map((f) => {
      if (f === oldNorm) {
        return newFull
      }
      if (f.startsWith(`${oldNorm}/`)) {
        return `${newFull}/${f.slice(oldNorm.length + 1)}`
      }
      return f
    })
    return pruneEmptyFolders({
      files: nextFiles,
      emptyFolders: sortUnique(nextEmpty),
    })
  }

  return null
}

function fileNameExists(workspace: ResourceWorkspace, fullPath: string): boolean {
  if (workspace.files.has(fullPath)) {
    return true
  }
  return workspace.emptyFolders.includes(fullPath)
}

/** Next available name like `untitled.txt`, `untitled-2.txt`, … */
export function uniqueFileName(
  workspace: ResourceWorkspace,
  parentPath: string,
  baseName: string,
): string {
  const base = baseName.includes('.') ? baseName : `${baseName}.txt`
  let candidate = base
  let i = 2
  while (fileNameExists(workspace, joinUnderParent(parentPath, candidate))) {
    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    const ext = dot > 0 ? base.slice(dot) : ''
    candidate = `${stem}-${i}${ext}`
    i += 1
  }
  return candidate
}

export function uniqueFolderName(
  workspace: ResourceWorkspace,
  parentPath: string,
  baseName = 'new-folder',
): string {
  let candidate = baseName
  let i = 2
  while (fileNameExists(workspace, joinUnderParent(parentPath, candidate))) {
    candidate = `${baseName}-${i}`
    i += 1
  }
  return candidate
}

/** Empty plain text file (zero bytes, inferred kind). */
export function addPlainFile(
  workspace: ResourceWorkspace,
  parentPath: string,
  fileName: string,
): ResourceWorkspace {
  const full = joinUnderParent(parentPath, fileName)
  const norm = normalizePath(full)
  if (!norm || norm.endsWith('/')) {
    return workspace
  }
  const next = new Map(workspace.files)
  next.set(norm, {
    path: norm,
    kind: inferKind(norm),
    bytes: new Uint8Array(0),
  })
  return pruneEmptyFolders({
    files: next,
    emptyFolders: workspace.emptyFolders,
  })
}

export function addEmptyFolder(
  workspace: ResourceWorkspace,
  parentPath: string,
  folderName: string,
): ResourceWorkspace {
  const full = joinUnderParent(parentPath, folderName)
  const norm = normalizePath(full)
  if (!norm) {
    return workspace
  }
  if (workspace.files.has(norm)) {
    return workspace
  }
  const emptyNext = sortUnique([...workspace.emptyFolders, norm])
  return pruneEmptyFolders({ files: workspace.files, emptyFolders: emptyNext })
}
