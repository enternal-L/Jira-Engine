import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react'
import { FaRegFile, FaRegFolder } from 'react-icons/fa'
import { MdOutlineDriveFolderUpload, MdOutlineUploadFile} from 'react-icons/md'
import {
  prefixPathMap,
  readFileListAsMap,
} from '../emscripten/mountResourcesFs'
import { buildResourceTree, type TreeNode } from '../emscripten/resourceTree'
import {
  addEmptyFolder,
  addPlainFile,
  createEmptyWorkspace,
  createWorkspaceFromResourceMap,
  deleteWorkspacePath,
  getTextContent,
  mergeResourceMapIntoWorkspace,
  pathBasename,
  renameWorkspaceEntry,
  setTextContent,
  uniqueFileName,
  uniqueFolderName,
  type ResourceWorkspace,
} from '../emscripten/resourceWorkspace'
import { FileTreeIcon, IconFolder } from './resourceIcons'
import { Link } from 'react-router-dom'

const VS = {
  sidebar: 'bg-[#252526]',
  border: 'border-[#3c3c3c]',
  text: 'text-[#cccccc]',
  textMuted: 'text-[#858585]',
  hover: 'hover:bg-[#2a2d2e]',
  active: 'bg-[#37373d]',
  button:
    'cursor-pointer text-[#cccccc] hover:bg-[#3c3c3c] border-[#3c3c3c]',
  editorBg: 'bg-[#1e1e1e]',
}

type ResourcePanelProps = {
  workspace: ResourceWorkspace | null
  onWorkspaceChange: (next: ResourceWorkspace) => void
  className?: string
}

const textDecoder = new TextDecoder()

const addIconClass = 'size-4'
const uploadIconClass = 'size-5'

const addBadgeClass =
  'pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-[#252526] px-0.5 text-[10px] leading-none text-white'

function mapPathAfterRename(
  oldNorm: string,
  newFull: string,
  p: string,
): string {
  if (p === oldNorm) {
    return newFull
  }
  if (oldNorm && p.startsWith(`${oldNorm}/`)) {
    return `${newFull}/${p.slice(oldNorm.length + 1)}`
  }
  return p
}

function parentOfPath(fullPath: string): string {
  if (!fullPath.includes('/')) {
    return ''
  }
  return fullPath.slice(0, fullPath.lastIndexOf('/'))
}

function LineNumberedTextarea(props: {
  value: string
  onChange: (next: string) => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = useMemo(() => {
    return Math.max(1, props.value.split('\n').length)
  }, [props.value])

  const syncScroll = useCallback(() => {
    const ta = taRef.current
    const g = gutterRef.current
    if (ta && g) {
      g.scrollTop = ta.scrollTop
    }
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        ref={gutterRef}
        className={`min-h-0 w-11 shrink-0 overflow-hidden ${VS.editorBg} select-none py-4 pl-1 pr-1 font-mono text-[13px] leading-relaxed ${VS.textMuted} text-center`}
        aria-hidden
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={taRef}
        wrap="off"
        className={`min-h-0 min-w-0 flex-1 resize-none overflow-auto whitespace-pre border-0 py-4 pl-2 pr-4 font-mono text-[13px] leading-relaxed text-[#d4d4d4] outline-none ${VS.editorBg}`}
        spellCheck={false}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onScroll={syncScroll}
      />
    </div>
  )
}

function TreeRows(props: {
  nodes: TreeNode[]
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
  selectedPath: string | null
  selectedKind: 'file' | 'folder' | 'root' | null
  onSelectFile: (path: string) => void
  onSelectFolder: (path: string) => void
  renamingPath: string | null
  renameDraft: string
  onRenameDraftChange: (v: string) => void
  onBeginRename: (path: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  renameInputRef: RefObject<HTMLInputElement | null>
  onDeletePath: (path: string) => void
}) {
  const {
    nodes,
    depth,
    expanded,
    toggle,
    selectedPath,
    selectedKind,
    onSelectFile,
    onSelectFolder,
    renamingPath,
    renameDraft,
    onRenameDraftChange,
    onBeginRename,
    onRenameCommit,
    onRenameCancel,
    renameInputRef,
    onDeletePath,
  } = props

  const treeDeleteBtnClass =
    'shrink-0 cursor-pointer border-0 bg-transparent px-1.5 py-0.5 font-mono text-[15px] leading-none text-[#858585] hover:text-red-400'

  /** ~10% wider than raw text so the I-beam zone is easier to hit. */
  const renameWidthCh = Math.max(
    4,
    Math.ceil((renameDraft.length + 1) * 1.1),
  )
  /** Matches label typography; width is set via `ch` only. */
  const renameInputClass = `box-border max-w-full min-w-0 shrink-0 cursor-text border-0 bg-transparent px-1 py-0.5 font-sans text-[13px] font-normal outline-none ring-0 focus:ring-0 selection:bg-[#37373d]/50 ${VS.text}`
  const treeNameHitClass =
    'max-w-full shrink-0 cursor-text truncate border-0 bg-transparent pl-1 pr-2 py-0.5 text-left font-normal text-inherit'

  return (
    <>
      {nodes.map((node) => {
        const pad = 8 + depth * 12
        if (node.kind === 'folder') {
          const isOpen = expanded.has(node.path)
          const isSel =
            selectedKind === 'folder' && selectedPath === node.path
          const isRenaming = renamingPath === node.path
          return (
            <div key={`f-${node.path || 'root'}-${node.name}`}>
              <div
                className={`flex w-full items-center gap-1 rounded-sm text-[13px] ${VS.text} ${isSel ? VS.active : VS.hover}`}
                style={{
                  paddingLeft: pad,
                  paddingRight: 8,
                  paddingTop: 2,
                  paddingBottom: 2,
                }}
              >
                <button
                  type="button"
                  className="inline-flex h-6 w-4 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[10px] text-[#858585]"
                  aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(node.path)
                    onSelectFolder(node.path)
                  }}
                >
                  {node.children.length > 0 ? (isOpen ? '▼' : '▶') : '·'}
                </button>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer border-0 bg-transparent p-0"
                  aria-label="Select folder"
                  onClick={() => onSelectFolder(node.path)}
                >
                  <IconFolder />
                </button>
                <div className="flex min-h-6 min-w-0 flex-1 items-stretch">
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      className={renameInputClass}
                      style={{ width: `${renameWidthCh}ch` }}
                      value={renameDraft}
                      onChange={(e) => onRenameDraftChange(e.target.value)}
                      onBlur={() => onRenameCommit()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          onRenameCommit()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          onRenameCancel()
                        }
                      }}
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        className={treeNameHitClass}
                        onClick={() => {
                          onSelectFolder(node.path)
                          onBeginRename(node.path)
                        }}
                      >
                        {node.name || '—'}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0"
                        aria-label="Select folder"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(node.path)
                          onSelectFolder(node.path)
                        }
                        }
                      />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className={treeDeleteBtnClass}
                  title="Delete"
                  aria-label={`Delete folder ${node.name || 'item'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeletePath(node.path)
                  }}
                >
                  ×
                </button>
              </div>
              {isOpen && node.children.length > 0 ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  toggle={toggle}
                  selectedPath={selectedPath}
                  selectedKind={selectedKind}
                  onSelectFile={onSelectFile}
                  onSelectFolder={onSelectFolder}
                  renamingPath={renamingPath}
                  renameDraft={renameDraft}
                  onRenameDraftChange={onRenameDraftChange}
                  onBeginRename={onBeginRename}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                  renameInputRef={renameInputRef}
                  onDeletePath={onDeletePath}
                />
              ) : null}
            </div>
          )
        }
        const isSel = selectedKind === 'file' && selectedPath === node.path
        const isRenaming = renamingPath === node.path
        return (
          <div
            key={`file-${node.path}`}
            className={`flex w-full items-center gap-1 rounded-sm text-[13px] ${VS.text} ${isSel ? VS.active : VS.hover}`}
            style={{
              paddingLeft: pad,
              paddingRight: 8,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <button
              type="button"
              className="h-6 w-4 shrink-0 cursor-pointer border-0 bg-transparent p-0"
              aria-label="Select file"
              onClick={() => onSelectFile(node.path)}
            />
            <button
              type="button"
              className="shrink-0 cursor-pointer border-0 bg-transparent p-0"
              aria-label="Select file"
              onClick={() => onSelectFile(node.path)}
            >
              <FileTreeIcon path={node.path} />
            </button>
            <div className="flex min-h-6 min-w-0 flex-1 items-stretch">
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  className={renameInputClass}
                  style={{ width: `${renameWidthCh}ch` }}
                  value={renameDraft}
                  onChange={(e) => onRenameDraftChange(e.target.value)}
                  onBlur={() => onRenameCommit()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onRenameCommit()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      onRenameCancel()
                    }
                  }}
                />
              ) : (
                <>
                  <button
                    type="button"
                    className={treeNameHitClass}
                    onClick={() => {
                      onSelectFile(node.path)
                      onBeginRename(node.path)
                    }}
                  >
                    {node.name}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Select file"
                    onClick={() => onSelectFile(node.path)}
                  />
                </>
              )}
            </div>
            <button
              type="button"
              className={treeDeleteBtnClass}
              title="Delete"
              aria-label={`Delete file ${node.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onDeletePath(node.path)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </>
  )
}

export function ResourcePanel({
  workspace,
  onWorkspaceChange,
  className,
}: ResourcePanelProps) {
  const tree = useMemo(
    () => (workspace ? buildResourceTree(workspace) : null),
    [workspace],
  )

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))
  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  /** Where new file/folder is created: '' = jira root */
  const [contextFolder, setContextFolder] = useState('')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<
    'file' | 'folder' | 'root' | null
  >(null)

  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const renameCommitLockRef = useRef(false)

  const activeFilePath =
    selectedKind === 'file' &&
    selectedPath &&
    workspace &&
    workspace.files.has(selectedPath)
      ? selectedPath
      : null

  const activeFile =
    activeFilePath && workspace ? workspace.files.get(activeFilePath) : null

  const textForEditor = useMemo(() => {
    if (!activeFilePath || !workspace || !activeFile) {
      return ''
    }
    const fromKind = getTextContent(workspace, activeFilePath)
    if (fromKind !== null) {
      return fromKind
    }
    const ext = activeFile.path.toLowerCase().split('.').pop() || ''
    const editableExt =
      ext === 'txt' ||
      ext === 'lua' ||
      ext === 'template' ||
      ext === 'templatem' ||
      ext === 'scene' ||
      ext === 'config'
    if (editableExt) {
      return textDecoder.decode(activeFile.bytes)
    }
    return ''
  }, [activeFilePath, workspace, activeFile])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const uploadFilesInputRef = useRef<HTMLInputElement>(null)
  const uploadFolderInputRef = useRef<HTMLInputElement>(null)

  const extension = useMemo(() => {
    if (!activeFile) {
      return ''
    }
    return activeFile.path.toLowerCase().split('.').pop() || ''
  }, [activeFile])

  const objectUrl = useMemo(() => {
    if (!activeFile) {
      return null
    }
    if (
      extension !== 'png' &&
      extension !== 'ogg' &&
      extension !== 'wav'
    ) {
      return null
    }
    const blob = new Blob([new Uint8Array(activeFile.bytes)])
    return URL.createObjectURL(blob)
  }, [activeFile, extension])

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [objectUrl])

  const isEditableText =
    extension === 'txt' ||
    extension === 'lua' ||
    extension === 'template' ||
    extension === 'templatem' ||
    extension === 'scene' ||
    extension === 'config'
  const isSupportedAudio = extension === 'ogg' || extension === 'wav'
  const isSupportedImage = extension === 'png'

  const ensureWs = useCallback((): ResourceWorkspace => {
    return workspace ?? createEmptyWorkspace()
  }, [workspace])

  const commitRename = useCallback(() => {
    if (renameCommitLockRef.current) {
      return
    }
    if (!workspace || renamingPath === null) {
      return
    }
    const trimmed = renameDraft.trim()
    if (!trimmed) {
      setRenameDraft(pathBasename(renamingPath))
      return
    }
    const oldNorm = renamingPath
    const next = renameWorkspaceEntry(workspace, oldNorm, trimmed)
    if (!next) {
      setRenameDraft(pathBasename(oldNorm))
      return
    }
    const parent = parentOfPath(oldNorm)
    const newFull = parent ? `${parent}/${trimmed}` : trimmed

    renameCommitLockRef.current = true
    onWorkspaceChange(next)
    setRenamingPath(null)
    setSelectedPath((sp) => (sp ? mapPathAfterRename(oldNorm, newFull, sp) : sp))
    setContextFolder((cf) => mapPathAfterRename(oldNorm, newFull, cf))
    setExpanded((e) => {
      const n = new Set<string>()
      for (const x of e) {
        n.add(mapPathAfterRename(oldNorm, newFull, x))
      }
      return n
    })
    queueMicrotask(() => {
      renameCommitLockRef.current = false
    })
  }, [workspace, renamingPath, renameDraft, onWorkspaceChange])

  const cancelRename = useCallback(() => {
    if (renamingPath) {
      setRenameDraft(pathBasename(renamingPath))
    }
    setRenamingPath(null)
  }, [renamingPath])

  const beginRename = useCallback((path: string) => {
    setRenamingPath(path)
    setRenameDraft(pathBasename(path))
  }, [])

  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus()
    }
  }, [renamingPath])

  const handleAddFile = useCallback(() => {
    const ws = ensureWs()
    const name = uniqueFileName(ws, contextFolder, 'untitled.txt')
    onWorkspaceChange(addPlainFile(ws, contextFolder, name))
    const full = contextFolder ? `${contextFolder}/${name}` : name
    setSelectedPath(full)
    setSelectedKind('file')
    setRenamingPath(full)
    setRenameDraft(name)
    setExpanded((e) => {
      const next = new Set(e)
      next.add('')
      let acc = ''
      for (const seg of contextFolder.split('/').filter(Boolean)) {
        acc = acc ? `${acc}/${seg}` : seg
        next.add(acc)
      }
      return next
    })
  }, [contextFolder, ensureWs, onWorkspaceChange])

  const handleAddFolder = useCallback(() => {
    const ws = ensureWs()
    const name = uniqueFolderName(ws, contextFolder, 'new-folder')
    onWorkspaceChange(addEmptyFolder(ws, contextFolder, name))
    const full = contextFolder ? `${contextFolder}/${name}` : name
    setContextFolder(full)
    setSelectedPath(full)
    setSelectedKind('folder')
    setRenamingPath(full)
    setRenameDraft(name)
    setExpanded((e) => new Set([...e, '', full]))
  }, [contextFolder, ensureWs, onWorkspaceChange])

  const handleDeletePath = useCallback(
    (path: string) => {
      if (!workspace || !path) {
        return
      }
      if (
        !window.confirm(
          `Are you sure? This action cannot be undone.`,
        )
      ) {
        return
      }
      onWorkspaceChange(deleteWorkspacePath(workspace, path))
      setRenamingPath((r) =>
        r === path || (r != null && path && r.startsWith(`${path}/`)) ? null : r,
      )
      const sp = selectedPath
      if (sp && (sp === path || (path && sp.startsWith(`${path}/`)))) {
        setSelectedPath(null)
        setSelectedKind(null)
      }
      setContextFolder((cf) => {
        if (!cf) {
          return cf
        }
        if (cf === path) {
          return parentOfPath(path)
        }
        if (path && cf.startsWith(`${path}/`)) {
          return parentOfPath(path)
        }
        return cf
      })
      setExpanded((e) => {
        const n = new Set<string>()
        for (const x of e) {
          if (x === path || (path && x.startsWith(`${path}/`))) {
            continue
          }
          n.add(x)
        }
        if (!n.has('')) {
          n.add('')
        }
        return n
      })
    },
    [onWorkspaceChange, selectedPath, workspace],
  )

  const onUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      const map = await readFileListAsMap(list)
      const prefixed = prefixPathMap(contextFolder, map)
      e.target.value = ''
      if (prefixed.size === 0) {
        return
      }
      if (workspace) {
        onWorkspaceChange(mergeResourceMapIntoWorkspace(workspace, prefixed))
        setRenamingPath(null)
      } else {
        onWorkspaceChange(createWorkspaceFromResourceMap(prefixed))
        setSelectedPath(null)
        setSelectedKind(null)
        setRenamingPath(null)
        setContextFolder('')
        setExpanded(new Set(['']))
      }
    },
    [contextFolder, onWorkspaceChange, workspace],
  )

  const onSelectFile = useCallback((path: string) => {
    setSelectedPath(path)
    setSelectedKind('file')
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    setContextFolder(parent)
  }, [])

  const onSelectFolder = useCallback((path: string) => {
    setSelectedPath(path)
    setSelectedKind('folder')
    setContextFolder(path)
  }, [])

  const rightTitle = activeFile?.path ?? ''

  return (
    <section
      className={`flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden rounded-sm ${VS.sidebar} ${className ?? ''}`}
    >
      <aside className={`flex w-[280px] shrink-0 flex-col border-r ${VS.border} min-h-0`}>
        <div
          className={`flex min-h-11 flex-wrap items-center gap-1 border-b px-1.5 py-1.5 ${VS.border}`}
        >
          <button
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 border-0 bg-transparent px-0.5 text-[13px] text-[#858585]"
            aria-label={expanded.has('') ? 'Collapse' : 'Expand'}
          >
            ·
          </button>

          <div className='min-w-0 flex-1'>
            <Link
              to="/"
              className={`truncate text-left font-mono text-[13px] font-medium ${VS.text} ${selectedKind === 'root' ? VS.active : ''} ${VS.hover} rounded px-1`}
            >
              jira
            </Link>
          </div>
          <button
            type="button"
            title="New file"
            aria-label="New file"
            className={`inline-flex shrink-0 items-center justify-center rounded border p-1.5 ${VS.button}`}
            onClick={handleAddFile}
          >
            <span className="relative inline-flex">
              <FaRegFile className={addIconClass} aria-hidden />
              <span className={addBadgeClass} aria-hidden>
                +
              </span>
            </span>
          </button>
          <button
            type="button"
            title="New folder"
            aria-label="New folder"
            className={`inline-flex shrink-0 items-center justify-center rounded border p-1.5 ${VS.button}`}
            onClick={handleAddFolder}
          >
            <span className="relative inline-flex">
              <FaRegFolder className={addIconClass} aria-hidden />
              <span className={addBadgeClass} aria-hidden>
                +
              </span>
            </span>
          </button>
          <button
            type="button"
            title="Upload files (merges into selected folder, or root)"
            aria-label="Upload files into selected directory or root"
            className={`inline-flex shrink-0 items-center justify-center rounded border p-1 ${VS.button}`}
            onClick={() => uploadFilesInputRef.current?.click()}
          >
            <MdOutlineUploadFile className={uploadIconClass} aria-hidden />
          </button>
          <button
            type="button"
            title="Upload folder (merges into selected folder, or root)"
            aria-label="Upload folder into selected directory or root"
            className={`inline-flex shrink-0 items-center justify-center rounded border p-1 ${VS.button}`}
            onClick={() => uploadFolderInputRef.current?.click()}
          >
            <MdOutlineDriveFolderUpload className={uploadIconClass} aria-hidden />
          </button>
          <input
            ref={uploadFilesInputRef}
            type="file"
            className="sr-only"
            multiple
            onChange={onUpload}
          />
          <input
            ref={uploadFolderInputRef}
            type="file"
            className="sr-only"
            multiple
            onChange={onUpload}
            {...({ webkitdirectory: '' } as Record<string, string>)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {tree && expanded.has('') ? (
            <TreeRows
              nodes={tree.children}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              selectedPath={selectedPath}
              selectedKind={selectedKind}
              onSelectFile={onSelectFile}
              onSelectFolder={onSelectFolder}
              renamingPath={renamingPath}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onBeginRename={beginRename}
              onRenameCommit={commitRename}
              onRenameCancel={cancelRename}
              renameInputRef={renameInputRef}
              onDeletePath={handleDeletePath}
            />
          ) : null}
          {(!workspace || workspace.files.size === 0) &&
          (!workspace || workspace.emptyFolders.length === 0) ? (
            <p className={`px-3 py-3 text-[12px] ${VS.textMuted}`}>
              No files yet. Add a file, folder, upload files, or upload a folder.
            </p>
          ) : null}
        </div>
      </aside>

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${VS.editorBg}`}>
          {rightTitle &&
            <header
            className={`border-b px-3 py-2 font-mono text-[13px] ${VS.border} ${VS.textMuted}`}
          >
            {rightTitle}
            </header>
          } 
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!activeFile ? (
            <p className={`px-4 py-6 text-[13px] ${VS.textMuted}`}>
              Select a file in the tree to edit or preview.
            </p>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-0 py-0">
              {isEditableText && workspace && activeFilePath ? (
                <LineNumberedTextarea
                  value={textForEditor}
                  onChange={(next) => {
                    onWorkspaceChange(
                      setTextContent(workspace, activeFilePath, next),
                    )
                  }}
                />
              ) : isSupportedImage && objectUrl ? (
                <div className="flex flex-1 items-start justify-center overflow-auto p-4">
                  <img
                    src={objectUrl}
                    alt={activeFile.path}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : isSupportedAudio && objectUrl ? (
                <div className="flex items-center gap-2 p-4">
                  <audio ref={audioRef} src={objectUrl} preload="metadata" />
                  <button
                    type="button"
                    className={`rounded border px-2 py-1 text-[12px] ${VS.button}`}
                    onClick={() => {
                      void audioRef.current?.play()
                    }}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className={`rounded border px-2 py-1 text-[12px] ${VS.button}`}
                    onClick={() => {
                      if (!audioRef.current) {
                        return
                      }
                      audioRef.current.pause()
                      audioRef.current.currentTime = 0
                    }}
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <p className={`p-4 text-[13px] ${VS.textMuted}`}>
                  Preview not supported for this file type.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
