import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'
const THEME_CHANGE_EVENT = 'testbed-theme-change'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.remove('dark')
    root.classList.add('light')
  }

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#14120f' : '#f6f4ee')
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {}

  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }))
}

export function toggleTheme(): Theme {
  const current = getTheme()
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

export function useTheme(): [Theme, (theme: Theme) => void, () => Theme] {
  const [theme, setThemeState] = useState<Theme>(getTheme)

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<Theme>
      if (customEvent.detail) {
        setThemeState(customEvent.detail)
      } else {
        setThemeState(getTheme())
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setThemeState(getTheme())
      }
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const setTheme = (t: Theme) => {
    applyTheme(t)
    setThemeState(t)
  }

  const toggle = () => {
    const next = toggleTheme()
    setThemeState(next)
    return next
  }

  return [theme, setTheme, toggle]
}
