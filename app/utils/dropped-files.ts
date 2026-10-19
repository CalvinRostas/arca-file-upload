export interface PickedFile {
  file: File
  /** Folders between the drop target and the file, joined by `/`. Empty for loose files. */
  relativeDir: string
}

/** Files from a drop, walking into dropped folders (keeps their structure). */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dataTransfer.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null)

  if (entries.length === 0) return [...dataTransfer.files].map((file) => ({ file, relativeDir: '' }))

  const out: PickedFile[] = []
  async function walk(entry: FileSystemEntry, dir: string) {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      out.push({ file, relativeDir: dir })
      return
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const childDir = dir ? `${dir}/${entry.name}` : entry.name
    // readEntries returns at most ~100 entries per call; keep reading until it's empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (batch.length === 0) break
      for (const child of batch) await walk(child, childDir)
    }
  }
  for (const entry of entries) await walk(entry, '')
  return out
}

/** Files from `<input type="file" webkitdirectory>`, which carry their path in `webkitRelativePath`. */
export function filesFromFolderInput(files: FileList): PickedFile[] {
  return [...files].map((file) => {
    const parts = file.webkitRelativePath.split('/')
    return { file, relativeDir: parts.slice(0, -1).join('/') }
  })
}

/** Skip the clutter operating systems leave in folders. */
export function isJunk({ file }: PickedFile): boolean {
  return file.name === '.DS_Store' || file.name === 'Thumbs.db' || file.name === 'desktop.ini'
}
