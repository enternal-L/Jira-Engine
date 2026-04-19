import { FaRegFile, FaRegFolder, FaRegImage } from 'react-icons/fa'
import { IoVolumeMediumOutline } from 'react-icons/io5'

const iconClass = 'h-4 w-4 shrink-0 text-[#c5c5c5]'

/** Folders in the tree */
export function IconFolder() {
  return <FaRegFolder className={iconClass} aria-hidden />
}

/**
 * File icons: images and audio by extension; all other files use the generic file icon.
 */
export function FileTreeIcon({ path }: { path: string }) {
  const ext = path.toLowerCase().split('.').pop() || ''
  if (ext === 'png') {
    return <FaRegImage className={iconClass} aria-hidden />
  }
  if (ext === 'ogg' || ext === 'wav') {
    return <IoVolumeMediumOutline className={iconClass} aria-hidden />
  }
  return <FaRegFile className={iconClass} aria-hidden />
}
