import type { Chapter, MoodKey, Person, PhotoMeta, Scene, ToneKey } from '../types'
import { addDays, addMonths, startOfWeek, toKey } from '../lib/date'
import { placeholderThumb } from '../lib/photos'
import { composeLocalChapter } from '../lib/narrative'
import { uid } from '../lib/id'

function iso(dayOffset: number, hour: number, minute = 0): string {
  const d = addDays(new Date(), dayOffset)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function makePhotos(seed: string, count: number, takenAt: string, lat?: number, lng?: number): PhotoMeta[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    name: `${seed}-${i + 1}.jpg`,
    thumb: placeholderThumb(`${seed}-${i}`),
    takenAt,
    lat,
    lng,
    width: 1280,
    height: 960,
  }))
}

interface DemoSceneInput {
  dayOffset: number
  hour: number
  minute?: number
  place: string
  title?: string
  note?: string
  mood?: MoodKey
  people: string[]
  photos: number
  lat?: number
  lng?: number
  highlight?: boolean
  seed: string
}

export interface DemoBundle {
  persons: Person[]
  scenes: Scene[]
  chapters: Chapter[]
}

export function buildDemo(toneKey: ToneKey): DemoBundle {
  const now = new Date().toISOString()

  const personDefs: { key: string; displayName: string; disambiguator?: string; aliases: string[]; note?: string }[] = [
    { key: 'minsu', displayName: '김민수', disambiguator: '회사', aliases: ['민수', '김대리'], note: '지금 프로젝트에서 같이 일하는 개발자. 말은 짧고 코드는 길다.' },
    { key: 'seoyeon', displayName: '이서연', aliases: ['서연'], note: '대학 동기. 몇 달에 한 번 만나도 어제 만난 것 같다.' },
    { key: 'jungwoo', displayName: '박정우', disambiguator: '전 직장', aliases: ['정우'], note: '전 직장 동료. 지금은 다른 회사에서 같은 일을 한다.' },
    { key: 'mom', displayName: '엄마', disambiguator: '가족', aliases: ['어머니'], note: '전화는 짧게, 걱정은 길게.' },
  ]

  const persons: Person[] = personDefs.map((p) => ({
    id: uid(),
    displayName: p.displayName,
    disambiguator: p.disambiguator,
    aliases: p.aliases,
    note: p.note,
    createdAt: now,
    sample: true,
  }))

  const personId = (key: string) => persons.find((p) => p.displayName === personDefs.find((d) => d.key === key)?.displayName)?.id ?? ''

  const inputs: DemoSceneInput[] = [
    {
      dayOffset: -1,
      hour: 15,
      minute: 20,
      place: '성수동 카페 온도',
      note: '오랜만에 만난 서연이와 세 시간 수다. 커피 값이 아깝지 않았다.',
      mood: 'excited',
      people: ['seoyeon'],
      photos: 2,
      lat: 37.5445,
      lng: 127.0561,
      seed: 'seongsu',
    },
    {
      dayOffset: -2,
      hour: 9,
      place: '북한산 우이령 입구',
      note: '정상까지 세 시간. 다리는 후들거리지만 하늘은 최고였다.',
      mood: 'excited',
      people: [],
      photos: 4,
      lat: 37.6586,
      lng: 126.9779,
      seed: 'bukhansan',
    },
    {
      dayOffset: -4,
      hour: 23,
      minute: 40,
      place: '집 작업실',
      note: '배포 마감. 새벽 두 시까지 로그를 봤다. 다음엔 미루지 말자.',
      mood: 'tired',
      people: [],
      photos: 1,
      seed: 'home-night',
    },
    {
      dayOffset: -6,
      hour: 14,
      place: '신림동의 작은 카페',
      note: '오래 미뤄 둔 일 하나를 끝냈다. 노트북은 켜 뒀지만 반은 딴짓.',
      mood: 'calm',
      people: [],
      photos: 2,
      lat: 37.4842,
      lng: 126.9296,
      seed: 'sillim',
    },
    {
      dayOffset: -8,
      hour: 18,
      minute: 30,
      place: '회사 회의실 3B',
      note: '예산 200만 원, 날짜는 12월 12일. 아직 아무것도 정해지지 않았다.',
      mood: 'plain',
      people: ['jungwoo', 'minsu'],
      photos: 1,
      seed: 'meeting',
    },
    {
      dayOffset: -10,
      hour: 10,
      place: '판교 사무실',
      note: '새 프로젝트 킥오프. 스프링 부트 3.2에 뷰 3, 일정은 3주.',
      mood: 'proud',
      people: ['minsu'],
      photos: 2,
      lat: 37.4021,
      lng: 127.1082,
      seed: 'kickoff',
    },
    {
      dayOffset: -13,
      hour: 19,
      place: '동네 한식당',
      note: '엄마 생신. 케이크는 작게, 말은 길게. 오랜만에 형도 왔다.',
      mood: 'flutter',
      people: ['mom'],
      photos: 3,
      seed: 'birthday',
    },
    {
      dayOffset: -16,
      hour: 20,
      minute: 10,
      place: '천왕산 가는 길',
      note: '5km 31분. 생각보다 몸이 가볍다.',
      mood: 'proud',
      people: [],
      photos: 1,
      seed: 'running',
    },
    {
      dayOffset: -21,
      hour: 16,
      place: '합정 서점',
      note: '김애란 새 소설. 첫 장만 읽고 덮었다가 다시 폈다.',
      mood: 'calm',
      people: [],
      photos: 2,
      seed: 'bookstore',
    },
    {
      dayOffset: -35,
      hour: 20,
      place: '을지로 노가리 골목',
      note: '정우와 반년 만에 만났다. 회사 이야기는 십 분, 나머지는 다 옛날 이야기.',
      mood: 'plain',
      people: ['jungwoo'],
      photos: 2,
      seed: 'euljiro',
    },
    {
      dayOffset: -42,
      hour: 17,
      place: '망원 한강공원',
      note: '해 질 무렵 강바람. 서연이가 다음 달에 이사한다고 했다.',
      mood: 'calm',
      people: ['seoyeon'],
      photos: 3,
      seed: 'hangang',
    },
    {
      dayOffset: -366,
      hour: 15,
      place: '성수동 카페 온도',
      note: '작년에도 이맘때 여기 앉아 다음 프로젝트를 고민했다. 결국 지금 하는 일을 골랐지.',
      mood: 'calm',
      people: ['seoyeon'],
      photos: 2,
      lat: 37.5445,
      lng: 127.0561,
      seed: 'oneyear',
    },
  ]

  const scenes: Scene[] = inputs.map((input) => {
    const startedAt = iso(input.dayOffset, input.hour, input.minute ?? 0)
    const eventDate = toKey(new Date(startedAt))
    const photos = makePhotos(input.seed, input.photos, startedAt, input.lat, input.lng)
    const personIds = input.people.map(personId).filter(Boolean)
    return {
      id: uid(),
      eventDate,
      startedAt,
      title: `${input.place}에서의 ${input.hour < 12 ? '오전' : input.hour < 18 ? '오후' : '저녁'}`,
      locationName: input.place,
      lat: input.lat,
      lng: input.lng,
      autoSummary: `${input.hour < 12 ? '오전' : input.hour < 18 ? '오후' : '저녁'} · ${input.place} · 사진 ${input.photos}장`,
      userNote: input.note,
      mood: input.mood,
      personIds,
      photos,
      sourceType: 'photo',
      isHighlight: true,
      interviewState: input.note ? 'answered' : 'pending',
      createdAt: now,
      sample: true,
    }
  })

  const chapters: Chapter[] = []
  const thisWeekStart = startOfWeek(new Date())
  for (const weekOffset of [1, 2]) {
    const start = addDays(thisWeekStart, -7 * weekOffset)
    const end = addDays(start, 6)
    const startKey = toKey(start)
    const endKey = toKey(end)
    const inRange = scenes.filter((s) => s.eventDate >= startKey && s.eventDate <= endKey)
    if (inRange.length === 0) continue
    const draft = composeLocalChapter({
      toneKey,
      scenes: inRange,
      persons,
      periodStart: startKey,
      periodEnd: endKey,
      kind: 'week',
    })
    chapters.push({
      id: uid(),
      kind: 'week',
      periodStart: startKey,
      periodEnd: endKey,
      seq: 2 - weekOffset,
      title: draft.title,
      bodyMd: draft.bodyMd,
      summary: draft.summary,
      toneKey,
      eventIds: draft.eventIds,
      coverSceneId: inRange[0]?.id,
      status: 'published',
      version: 1,
      generatedBy: 'local',
      createdAt: now,
      sample: true,
    })
  }

  // 지난달 기록도 한 편 (책이 쌓인 느낌)
  const lastMonth = addMonths(new Date(), -1)
  const lmStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
  const lmEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
  const lmScenes = scenes.filter((s) => s.eventDate >= toKey(lmStart) && s.eventDate <= toKey(lmEnd))
  if (lmScenes.length > 0) {
    const draft = composeLocalChapter({
      toneKey,
      scenes: lmScenes,
      persons,
      periodStart: toKey(lmStart),
      periodEnd: toKey(lmEnd),
      kind: 'month',
    })
    chapters.push({
      id: uid(),
      kind: 'month',
      periodStart: toKey(lmStart),
      periodEnd: toKey(lmEnd),
      seq: 1,
      title: draft.title,
      bodyMd: draft.bodyMd,
      summary: draft.summary,
      toneKey,
      eventIds: draft.eventIds,
      coverSceneId: lmScenes[0]?.id,
      status: 'published',
      version: 1,
      generatedBy: 'local',
      createdAt: now,
      sample: true,
    })
  }

  return { persons, scenes, chapters }
}
