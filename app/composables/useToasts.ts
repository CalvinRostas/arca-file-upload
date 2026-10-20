export interface Toast {
  id: number
  message: string
  icon: string
  /** e.g. "Undo" or "Show". Runs, then dismisses the toast. */
  action?: { label: string; run: () => unknown }
}

const toasts = ref<Toast[]>([])
let nextId = 0
const LIFETIME_MS = 7000

/** Short-lived confirmations with an optional action, shown in the bottom-right dock. */
export function useToasts() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts: readonly(toasts),
    dismiss,
    show(toast: Omit<Toast, 'id'>) {
      const id = ++nextId
      // One at a time keeps the dock calm; a newer confirmation replaces the older one.
      toasts.value = [{ ...toast, id }]
      setTimeout(() => dismiss(id), LIFETIME_MS)
    },
  }
}
