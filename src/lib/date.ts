const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function toKey(date: Date): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** 월요일 시작 주 */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay() // 0=일
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}

export function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6)
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function formatDate(key: string): string {
  const d = fromKey(key)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`
}

export function formatDateLong(key: string): string {
  const d = fromKey(key)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`
}

export function formatMonthDay(key: string): string {
  const d = fromKey(key)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h < 12 ? '오전' : '오후'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${period} ${hour12}:${`${m}`.padStart(2, '0')}`
}

export function weekdayOf(key: string): string {
  return WEEKDAYS[fromKey(key).getDay()]
}

/** '오늘' · '어제' · '3일 전' · '11월 12일' */
export function relativeDay(key: string): string {
  const today = startOfDay(new Date())
  const target = fromKey(key)
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff > 1 && diff < 7) return `${diff}일 전`
  return formatMonthDay(key)
}

export function isoAt(dateKey: string, hour = 12, minute = 0): string {
  const d = fromKey(dateKey)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export function periodLabel(startKey: string, endKey: string): string {
  const s = fromKey(startKey)
  const e = fromKey(endKey)
  if (s.getFullYear() !== e.getFullYear()) {
    return `${s.getFullYear()}년 ${s.getMonth() + 1}월 — ${e.getFullYear()}년 ${e.getMonth() + 1}월`
  }
  if (s.getMonth() === e.getMonth()) {
    return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}–${e.getDate()}일`
  }
  return `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`
}

export function timeOfDayWord(iso: string): string {
  const h = new Date(iso).getHours()
  if (h < 6) return '새벽'
  if (h < 9) return '아침'
  if (h < 12) return '오전'
  if (h < 14) return '점심 무렵'
  if (h < 18) return '오후'
  if (h < 22) return '저녁'
  return '밤'
}

export function monthRangeOf(date: Date): { start: string; end: string } {
  return { start: toKey(startOfMonth(date)), end: toKey(endOfMonth(date)) }
}

export function weekRangeOf(date: Date): { start: string; end: string } {
  return { start: toKey(startOfWeek(date)), end: toKey(endOfWeek(date)) }
}

export function isSameDay(a: string, b: string): boolean {
  return a === b
}
