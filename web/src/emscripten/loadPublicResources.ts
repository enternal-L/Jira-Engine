/**
 * Load files listed in `public/resources/_manifest.json` into a path → bytes map.
 * Keys are workspace paths under `resources/...` (VFS root `/` = workspace root).
 */

type Manifest = {
  files: string[]
}

export async function fetchPublicResourcesTree(
  baseUrl: string,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>()
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const manifestUrl = `${base}resources/_manifest.json`
  let manifest: Manifest
  try {
    const res = await fetch(manifestUrl)
    if (!res.ok) {
      return out
    }
    manifest = (await res.json()) as Manifest
  } catch {
    return out
  }
  const files = Array.isArray(manifest.files) ? manifest.files : []
  await Promise.all(
    files.map(async (rel) => {
      const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '')
      if (!norm || norm.includes('..')) {
        return
      }
      const underResources = norm.replace(/^resources\//i, '')
      if (!underResources) {
        return
      }
      const key = `resources/${underResources}`
      try {
        const r = await fetch(`${base}resources/${underResources}`)
        if (!r.ok) {
          return
        }
        out.set(key, new Uint8Array(await r.arrayBuffer()))
      } catch {
        // skip missing file
      }
    }),
  )
  return out
}

/** Optional root-level file from `public/` (e.g. starter.txt). */
export async function fetchPublicRootFile(
  baseUrl: string,
  name: string,
): Promise<Uint8Array | null> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  try {
    const r = await fetch(`${base}${encodeURI(name)}`)
    if (!r.ok) {
      return null
    }
    return new Uint8Array(await r.arrayBuffer())
  } catch {
    return null
  }
}
