import { useEffect } from 'react'

// Ctrl+Shift+E (Cmd+Shift+E) anywhere in a table panel shows its query box, or the WHERE again.
export function useQueryShortcut(isOn: boolean, onToggle: () => void): void {
  useEffect(() => {
    if (!isOn) {
      return undefined
    }
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyE') {
        event.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [isOn, onToggle])
}
