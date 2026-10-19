import type { Upload as TusUpload } from 'tus-js-client'
import type { ConflictChoice, IngestResult } from '~/types/library'

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'done' | 'skipped' | 'failed' | 'interrupted'

export interface UploadTask {
  id: string
  name: string
  size: number
  folderId: string | null
  /** Where it's going, for display: "Library" or the Folder name. */
  folderName: string
  relativeDir: string
  onConflict: ConflictChoice
  status: UploadStatus
  sent: number
  bytesPerSecond: number
  error: string | null
  result: IngestResult | null
  /** Groups the files of one drop or pick, for batched Duplicate notices. */
  batchId: string
  /** Absent for interrupted uploads restored after a reload until the file is picked again. */
  file?: File
  lastModified: number
}

export interface NewUpload {
  file: File
  relativeDir: string
  onConflict: ConflictChoice
}

const PENDING_KEY = 'arca:interrupted-uploads'
const CONCURRENCY = 2

// One queue for the whole tab (client-only state; uploads don't exist during SSR).
const tasks = ref<UploadTask[]>([])
const libraryVersion = ref(0)
const running = new Map<string, TusUpload>()
let restored = false

type PersistedTask = Pick<
  UploadTask,
  | 'id'
  | 'name'
  | 'size'
  | 'folderId'
  | 'folderName'
  | 'relativeDir'
  | 'onConflict'
  | 'sent'
  | 'batchId'
  | 'lastModified'
>

function persist() {
  const pending: PersistedTask[] = tasks.value
    .filter((t) => ['queued', 'uploading', 'paused', 'interrupted'].includes(t.status))
    .map(({ id, name, size, folderId, folderName, relativeDir, onConflict, sent, batchId, lastModified }) => ({
      id,
      name,
      size,
      folderId,
      folderName,
      relativeDir,
      onConflict,
      sent,
      batchId,
      lastModified,
    }))
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
}

function restore() {
  if (restored || !import.meta.client) return
  restored = true
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as PersistedTask[]
    tasks.value.push(
      ...pending.map((t) => ({ ...t, status: 'interrupted' as const, bytesPerSecond: 0, error: null, result: null })),
    )
  } catch {
    localStorage.removeItem(PENDING_KEY)
  }
}

/** Same file, same destination, same choice → same fingerprint, so tus resumes the right upload. */
function fingerprint(
  t: Pick<UploadTask, 'name' | 'size' | 'lastModified' | 'folderId' | 'relativeDir' | 'onConflict'>,
) {
  return ['arca', t.folderId ?? 'root', t.relativeDir, t.name, t.size, t.lastModified, t.onConflict].join('/')
}

function pump() {
  const active = tasks.value.filter((t) => t.status === 'uploading').length
  const next = tasks.value.filter((t) => t.status === 'queued').slice(0, Math.max(0, CONCURRENCY - active))
  for (const task of next) void start(task)
}

async function start(task: UploadTask) {
  if (!task.file) return
  task.status = 'uploading'
  task.error = null
  const { Upload } = await import('tus-js-client')
  const config = useRuntimeConfig()
  let lastSample = { at: performance.now(), sent: task.sent }

  const upload = new Upload(task.file, {
    endpoint: '/api/uploads',
    chunkSize: config.public.uploadChunkBytes,
    retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    fingerprint: async () => fingerprint(task),
    metadata: {
      filename: task.name,
      filetype: task.file.type,
      folderId: task.folderId ?? '',
      relativeDir: task.relativeDir,
      onConflict: task.onConflict,
    },
    onProgress(sent) {
      task.sent = sent
      const now = performance.now()
      if (now - lastSample.at > 1000) {
        const rate = ((sent - lastSample.sent) / (now - lastSample.at)) * 1000
        task.bytesPerSecond = task.bytesPerSecond ? task.bytesPerSecond * 0.7 + rate * 0.3 : rate
        lastSample = { at: now, sent }
      }
    },
    onChunkComplete(_chunk, accepted) {
      // Server-confirmed progress, remembered so an interrupted upload shows where it stopped.
      task.sent = accepted
      persist()
    },
    onSuccess({ lastResponse }) {
      running.delete(task.id)
      let result: IngestResult | null = null
      try {
        result = JSON.parse(lastResponse.getBody()) as IngestResult
      } catch {
        // Resumed an upload that had already finished: no result body, the File exists.
      }
      task.result = result
      task.status = result?.status === 'skipped' ? 'skipped' : 'done'
      task.sent = task.size
      task.file = undefined
      libraryVersion.value++
      useDuplicateNotices().collect(task)
      persist()
      pump()
    },
    onError(error) {
      running.delete(task.id)
      task.status = 'failed'
      const body = 'originalResponse' in error ? error.originalResponse?.getBody() : undefined
      task.error = body && body.length < 200 ? body : 'The upload failed. Try again.'
      persist()
      pump()
    },
  })
  running.set(task.id, upload)

  const previous = await upload.findPreviousUploads()
  if (previous[0]) upload.resumeFromPreviousUpload(previous[0])
  upload.start()
  persist()
}

/** The upload queue: add, pause, resume, cancel. Shared by the whole app. */
export function useUploads() {
  restore()

  const active = computed(() => tasks.value.filter((t) => ['queued', 'uploading', 'paused'].includes(t.status)))
  const totals = computed(() => {
    const list = active.value
    const size = list.reduce((sum, t) => sum + t.size, 0)
    const sent = list.reduce((sum, t) => sum + t.sent, 0)
    const rate = list.reduce((sum, t) => sum + (t.status === 'uploading' ? t.bytesPerSecond : 0), 0)
    return { size, sent, rate }
  })

  return {
    tasks: readonly(tasks),
    active,
    totals,
    /** Bumped whenever an upload lands, so Library views know to refresh. */
    libraryVersion: readonly(libraryVersion),

    add(files: NewUpload[], folder: { id: string | null; name: string }) {
      const batchId = crypto.randomUUID()
      for (const { file, relativeDir, onConflict } of files) {
        // Picking a file again that was interrupted by a reload resumes it instead of starting over.
        const existing = tasks.value.find(
          (t) =>
            t.status === 'interrupted' &&
            t.name === file.name &&
            t.size === file.size &&
            t.lastModified === file.lastModified &&
            t.folderId === folder.id &&
            t.relativeDir === relativeDir,
        )
        if (existing) {
          existing.file = file
          existing.status = 'queued'
          continue
        }
        tasks.value.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          folderId: folder.id,
          folderName: folder.name,
          relativeDir,
          onConflict,
          status: 'queued',
          sent: 0,
          bytesPerSecond: 0,
          error: null,
          result: null,
          batchId,
          file,
          lastModified: file.lastModified,
        })
      }
      persist()
      pump()
    },

    /** Re-attach a picked file to an interrupted upload. False if it isn't the same file. */
    reattach(taskId: string, file: File): boolean {
      const task = tasks.value.find((t) => t.id === taskId)
      if (!task || file.name !== task.name || file.size !== task.size || file.lastModified !== task.lastModified) {
        return false
      }
      task.file = file
      task.status = 'queued'
      pump()
      return true
    },

    pause(taskId: string) {
      const task = tasks.value.find((t) => t.id === taskId)
      if (!task) return
      void running.get(taskId)?.abort()
      running.delete(taskId)
      task.status = 'paused'
      task.bytesPerSecond = 0
      pump()
    },

    resume(taskId: string) {
      const task = tasks.value.find((t) => t.id === taskId)
      if (task && (task.status === 'paused' || task.status === 'failed')) {
        task.status = 'queued'
        pump()
      }
    },

    cancel(taskId: string) {
      const upload = running.get(taskId)
      running.delete(taskId)
      // `abort(true)` also deletes the partial upload on the server.
      void upload?.abort(true)
      tasks.value = tasks.value.filter((t) => t.id !== taskId)
      persist()
      pump()
    },

    /** Tell Library views something changed outside an upload (e.g. a discarded copy). */
    touchLibrary() {
      libraryVersion.value++
    },

    clearFinished() {
      tasks.value = tasks.value.filter((t) => !['done', 'skipped'].includes(t.status))
      persist()
    },
  }
}
