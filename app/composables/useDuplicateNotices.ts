import type { UploadTask } from './useUploads'

export interface DuplicateNotice {
  id: string
  /** The new copies that could be discarded. */
  fileIds: string[]
  /** Set for a single duplicate: where the original lives. */
  single: { name: string; originalName: string; folder: string } | null
}

const notices = ref<DuplicateNotice[]>([])
const pending = new Map<string, { fileIds: string[]; single: DuplicateNotice['single'] }>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Duplicate notices (GLOSSARY: Duplicate). One per batch of uploads: a single duplicate names
 * the original; several are summarized.
 */
export function useDuplicateNotices() {
  function flush(batchId: string) {
    const entry = pending.get(batchId)
    pending.delete(batchId)
    timers.delete(batchId)
    if (!entry || entry.fileIds.length === 0) return
    notices.value.push({
      id: batchId,
      fileIds: entry.fileIds,
      single: entry.fileIds.length === 1 ? entry.single : null,
    })
  }

  return {
    notices: readonly(notices),

    collect(task: UploadTask) {
      const result = task.result
      if (result?.status !== 'added' || !result.duplicateOf) return
      const entry = pending.get(task.batchId) ?? { fileIds: [], single: null }
      entry.fileIds.push(result.file.id)
      entry.single = {
        name: result.file.name,
        originalName: result.duplicateOf.name,
        folder: result.duplicateOf.path.at(-1)?.name ?? 'Library',
      }
      pending.set(task.batchId, entry)
      // Wait for the rest of the batch to land before speaking up.
      clearTimeout(timers.get(task.batchId))
      timers.set(
        task.batchId,
        setTimeout(() => flush(task.batchId), 1500),
      )
    },

    dismiss(id: string) {
      notices.value = notices.value.filter((n) => n.id !== id)
    },
  }
}
