import type { PhotoMeta, Scene, SceneDraft } from '../types'
import { isoAt, timeOfDayWord, toKey } from './date'
import { uid } from './id'

export function buildAutoSummary(scene: Pick<Scene, 'photos' | 'startedAt' | 'locationName'>): string {
  const time = timeOfDayWord(scene.startedAt)
  const place = scene.locationName?.trim()
  const photoCount = scene.photos.length
  const bits = [time]
  if (place) bits.push(place)
  bits.push(photoCount > 0 ? `사진 ${photoCount}장` : '직접 기록')
  return bits.join(' · ')
}

export function buildTitle(input: { locationName?: string; startedAt: string; photos: PhotoMeta[] }): string {
  const time = timeOfDayWord(input.startedAt)
  const place = input.locationName?.trim()
  if (place) return `${place}에서의 ${time}`
  if (input.photos.length > 0) return `${time}, 남겨 둔 사진`
  return `${time}의 장면`
}

export function sceneFromDraft(draft: SceneDraft): Scene {
  const firstPhotoTime = draft.photos
    .map((p) => p.takenAt)
    .filter((v): v is string => Boolean(v))
    .sort()[0]
  const startedAt = firstPhotoTime ?? draft.startedAt
  const eventDate = toKey(new Date(startedAt))
  const locationName = draft.locationName.trim() || undefined
  return {
    id: uid(),
    eventDate,
    startedAt,
    title: buildTitle({ locationName, startedAt, photos: draft.photos }),
    locationName,
    lat: draft.lat,
    lng: draft.lng,
    autoSummary: buildAutoSummary({ photos: draft.photos, startedAt, locationName }),
    userNote: draft.note.trim() || undefined,
    personIds: [],
    photos: draft.photos,
    sourceType: draft.photos.length > 0 ? 'photo' : 'manual',
    isHighlight: true,
    interviewState: draft.note.trim() ? 'answered' : 'pending',
    createdAt: new Date().toISOString(),
  }
}

export function groupDraftsByDate(photos: PhotoMeta[], fallbackDate = toKey(new Date())): SceneDraft[] {
  const groups = new Map<string, PhotoMeta[]>()
  for (const photo of photos) {
    const date = photo.takenAt ? toKey(new Date(photo.takenAt)) : fallbackDate
    const list = groups.get(date) ?? []
    list.push(photo)
    groups.set(date, list)
  }
  const drafts: SceneDraft[] = []
  for (const [date, list] of groups) {
    list.sort((a, b) => (a.takenAt ?? '').localeCompare(b.takenAt ?? ''))
    const withGps = list.find((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    const first = list[0]
    const hour = first?.takenAt ? new Date(first.takenAt).getHours() : 12
    drafts.push({
      key: `${date}-${uid()}`,
      eventDate: date,
      startedAt: first?.takenAt ?? isoAt(date, hour),
      locationName: '',
      lat: withGps?.lat,
      lng: withGps?.lng,
      photos: list,
      note: '',
    })
  }
  return drafts.sort((a, b) => b.eventDate.localeCompare(a.eventDate))
}

export function coordinateLabel(lat?: number, lng?: number): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return ''
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}
