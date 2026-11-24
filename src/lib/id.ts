export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 문자열에서 안정적인 32bit 해시 — 문장 변형을 결정적으로 고를 때 사용 */
export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function pick<T>(items: readonly T[], seed: string): T {
  return items[hash(seed) % items.length]
}
