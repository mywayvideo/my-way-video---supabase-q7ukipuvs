const PREFIX = '[DEBUG-FRONT]'

export function debugGroup(label: string, ...args: any[]): void {
  try {
    console.groupCollapsed(`${PREFIX} ${label}`, ...args)
  } catch {
    /* no-op */
  }
}

export function debugGroupEnd(): void {
  try {
    console.groupEnd()
  } catch {
    /* no-op */
  }
}

export function debugLog(label: string, ...args: any[]): void {
  try {
    console.log(`${PREFIX} ${label}`, ...args)
  } catch {
    /* no-op */
  }
}

export function debugWarn(label: string, ...args: any[]): void {
  try {
    console.warn(`${PREFIX} ${label}`, ...args)
  } catch {
    /* no-op */
  }
}

export function safeLen(val: any): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'string') return val.length
  if (Array.isArray(val)) return val.length
  if (typeof val === 'object') return Object.keys(val).length
  return 0
}
