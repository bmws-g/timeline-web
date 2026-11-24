/**
 * 사진 좌표(EXIF GPS) → 읽기 좋은 한국어 장소명.
 *
 * OpenStreetMap Nominatim 무료 공용 서버를 쓴다. 공용 서버 정책을 지킨다:
 *  · 초당 1요청 이하: 요청은 큐로 직렬화하고 요청 사이를 최소 1.1초 띄운다.
 *  · 같은 좌표는 다시 부르지 않는다(메모리 캐시, 동시 요청은 하나로 합친다).
 *  · 브라우저가 보내는 Referer/User-Agent로 앱을 식별한다.
 * 좌표만 보내며 사진·메모 같은 다른 내용은 전송하지 않는다.
 * 실패하면 null을 돌려주고, 화면에서는 좌표 표시 + 직접 입력으로 넘어간다.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const MIN_INTERVAL_MS = 1100
const TIMEOUT_MS = 9000

interface NominatimAddress {
  [key: string]: string | undefined
}

export interface NominatimReverse {
  name?: string
  display_name?: string
  address?: NominatimAddress
  error?: string
}

const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

let queueTail: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

/** 직렬화된 큐 안에서 호출되어 요청 사이 간격을 보장한다. */
async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait))
  lastRequestAt = Date.now()
}

function clean(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

/**
 * Nominatim 응답에서 "동네 + 장소" 형태의 짧은 한국어 이름을 고른다.
 * 예: "성수2가3동 아차산로", "성수동 카페 온도", "역삼1동 강남".
 */
export function formatPlaceName(data: NominatimReverse): string | null {
  const addr = data.address ?? {}
  const dong =
    clean(addr.suburb) ??
    clean(addr.quarter) ??
    clean(addr.neighbourhood) ??
    clean(addr.village) ??
    clean(addr.town) ??
    clean(addr.city_district)
  const road = clean(addr.road)
  const ownName = clean(data.name)
  const poi =
    clean(addr.amenity) ??
    clean(addr.tourism) ??
    clean(addr.shop) ??
    clean(addr.leisure) ??
    clean(addr.building) ??
    clean(addr.office) ??
    (ownName && ownName !== road && ownName !== dong ? ownName : undefined)
  const subject = poi ?? road
  const main = subject ?? dong ?? clean(addr.borough) ?? clean(addr.city)

  const parts: string[] = []
  if (dong && main && !main.includes(dong)) parts.push(dong)
  if (main) parts.push(main)
  const label = parts.join(' ').trim()
  if (label) return label.length > 40 ? `${label.slice(0, 39).trim()}…` : label

  const fallback = clean(data.display_name)?.split(',')[0]
  return fallback ?? null
}

async function requestPlaceName(lat: number, lng: number): Promise<string | null> {
  await throttle()
  const url =
    `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=ko`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
    if (!res.ok) throw new Error(`nominatim ${res.status}`)
    const data = (await res.json()) as NominatimReverse
    if (data.error) return null
    return formatPlaceName(data)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 좌표 → 장소명. 이름을 못 찾으면 null, 네트워크·서버 오류면 예외를 던진다.
 * 여러 초안이 한꺼번에 들어와도 초당 1요청으로 줄 세워 처리한다.
 */
export function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = coordKey(lat, lng)
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null)

  const running = inflight.get(key)
  if (running) return running

  const job = queueTail
    .then(() => requestPlaceName(lat, lng))
    .then((name) => {
      cache.set(key, name)
      return name
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, job)
  queueTail = job.catch(() => undefined)
  return job
}
