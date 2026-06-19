import { useState, useEffect, useCallback } from 'react'

export function useSidebarVisibility() {
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('admin-sidebar-visible')
    return saved !== null ? JSON.parse(saved) : true
  })

  const toggleSidebar = useCallback(() => {
    setIsSidebarVisible((prev) => {
      const newState = !prev
      localStorage.setItem('admin-sidebar-visible', JSON.stringify(newState))
      return newState
    })
  }, [])

  // Sync state if another tab changes it
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'admin-sidebar-visible' && e.newValue !== null) {
        setIsSidebarVisible(JSON.parse(e.newValue))
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return { isSidebarVisible, toggleSidebar }
}
