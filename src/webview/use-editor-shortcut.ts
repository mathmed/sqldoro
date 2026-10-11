import { useEffect } from 'react'

// Ctrl+Shift+E (Cmd+Shift+E) anywhere in a table panel opens its query in an SQL editor.
export function useEditorShortcut(isOn: boolean, onOpen: () => void): void {
  useEffect(() => {
    if (!isOn) {
      return undefined
    }
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyE') {
        event.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [isOn, onOpen])
}
