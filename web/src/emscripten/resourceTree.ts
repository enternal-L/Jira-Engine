import type { ResourceWorkspace } from './resourceWorkspace'

export type TreeNode = {
  name: string
  /** Full path under jira root (no leading slash). Empty string = jira root. */
  path: string
  kind: 'file' | 'folder'
  children: TreeNode[]
}

function sortChildren(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'folder' ? -1 : 1
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  for (const n of nodes) {
    if (n.children.length > 0) {
      sortChildren(n.children)
    }
  }
}

/**
 * Build a nested tree for the sidebar. Virtual root "jira" is added in the UI;
 * paths here are relative to that root.
 */
export function buildResourceTree(workspace: ResourceWorkspace): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    kind: 'folder',
    children: [],
  }

  const findOrCreateFolder = (parent: TreeNode, segment: string, fullPath: string) => {
    let node = parent.children.find((c) => c.name === segment && c.kind === 'folder')
    if (!node) {
      node = { name: segment, path: fullPath, kind: 'folder', children: [] }
      parent.children.push(node)
    }
    return node
  }

  for (const filePath of workspace.files.keys()) {
    const parts = filePath.split('/').filter(Boolean)
    if (parts.length === 0) {
      continue
    }
    let parent = root
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      const isLast = i === parts.length - 1
      acc = acc ? `${acc}/${seg}` : seg
      if (isLast) {
        parent.children.push({
          name: seg,
          path: filePath,
          kind: 'file',
          children: [],
        })
      } else {
        parent = findOrCreateFolder(parent, seg, acc)
      }
    }
  }

  for (const folderPath of workspace.emptyFolders) {
    const parts = folderPath.split('/').filter(Boolean)
    if (parts.length === 0) {
      continue
    }
    let parent = root
    let acc = ''
    for (const seg of parts) {
      acc = acc ? `${acc}/${seg}` : seg
      parent = findOrCreateFolder(parent, seg, acc)
    }
  }

  sortChildren(root.children)
  return root
}
