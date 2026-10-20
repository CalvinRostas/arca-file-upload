import type { Restored } from '~/types/library'

/**
 * Moving Items to Trash and back, with the confirmations that go with it. Every Library view
 * refreshes through `touchLibrary`, so an Undo works even after the page has changed.
 */
export function useTrash() {
  const uploads = useUploads()
  const toasts = useToasts()

  function changed() {
    uploads.touchLibrary()
    void refreshNuxtData('tags') // file counts per Tag
  }

  function failed(error: unknown) {
    toasts.show({ icon: 'lucide:circle-alert', message: apiErrorMessage(error) })
  }

  async function restore(entryIds: string[], options: { announce?: boolean } = {}): Promise<Restored[] | null> {
    try {
      const restored = await $fetch<Restored[]>('/api/trash/restore', { method: 'POST', body: { ids: entryIds } })
      changed()
      if (options.announce !== false) announce(restored)
      return restored
    } catch (error) {
      failed(error)
      return null
    }
  }

  function announce(restored: Restored[]) {
    const [only] = restored
    if (restored.length !== 1 || !only) {
      toasts.show({ icon: 'lucide:undo-2', message: `Restored ${restored.length} items` })
      return
    }
    const folder = only.path.at(-1)
    const where = folder ? folder.name : 'Library'
    toasts.show({
      icon: 'lucide:undo-2',
      message: only.renamed ? `Restored to ${where} as “${only.name}”` : `Restored “${only.name}” to ${where}`,
      action: {
        label: 'Show',
        run: () => navigateTo(folder ? `/folders/${folder.id}` : '/'),
      },
    })
  }

  return {
    restore,

    async moveToTrash(items: { id: string; name: string }[]): Promise<boolean> {
      try {
        const { entryIds } = await $fetch('/api/items/trash', {
          method: 'POST',
          body: { ids: items.map((i) => i.id) },
        })
        changed()
        toasts.show({
          icon: 'lucide:trash-2',
          message: items.length === 1 ? `Moved “${items[0]!.name}” to Trash` : `Moved ${items.length} items to Trash`,
          action: { label: 'Undo', run: () => restore(entryIds, { announce: false }) },
        })
        return true
      } catch (error) {
        failed(error)
        return false
      }
    },
  }
}
