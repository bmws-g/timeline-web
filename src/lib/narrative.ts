import type { Chapter, MoodKey, Person, Scene, ToneKey } from '../types'
import { formatMonthDay, fromKey, periodLabel, timeOfDayWord } from './date'
import { moodOf, toneOf } from '../data/tones'
import { pick } from './id'

export interface ChapterDraft {
  title: string
  bodyMd: string
  summary: string
  eventIds: string[]
}

function sortScenes(scenes: Scene[]): Scene[] {
  return [...scenes].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

function peopleOf(scene: Scene, persons: Person[]): Person[] {
  return scene.personIds
    .map((id) => persons.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p))
}

/** 한글 받침 유무로 조사를 고른다 (이서연과 / 최유진이). */
function hasFinalConsonant(word: string): boolean {
  const last = [...word.trim()].pop()
  if (!last) return false
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

function particle(word: string, afterConsonant: string, afterVowel: string): string {
  return hasFinalConsonant(word) ? afterConsonant : afterVowel
}

/** ['이서연','최유진'] → '이서연과 최유진' */
function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  const head = names
    .slice(0, -1)
    .map((name) => `${name}${particle(name, '과', '와')}`)
    .join(' ')
  return `${head} ${names[names.length - 1]}`
}

function peoplePhrase(scene: Scene, persons: Person[]): string {
  const names = peopleOf(scene, persons)
    .map((p) => p.displayName)
    .filter(Boolean)
  return joinNames(names)
}

/** '이서연과 최유진이' — 주격 조사까지 붙인 형태 */
function peopleSubject(scene: Scene, persons: Person[]): string {
  const names = peopleOf(scene, persons)
    .map((p) => p.displayName)
    .filter(Boolean)
  if (names.length === 0) return ''
  const last = names[names.length - 1]
  return `${joinNames(names)}${particle(last, '이', '가')}`
}

function placeOf(scene: Scene): string {
  return scene.locationName?.trim() || '어딘가'
}

function photoPhrase(scene: Scene): string {
  const n = scene.photos.length
  if (n === 0) return ''
  if (n === 1) return '사진 한 장'
  return `사진 ${n}장`
}

const FRIEND_MOOD: Record<MoodKey, string> = {
  proud: '꽤 뿌듯해 보이더라.',
  tired: '솔직히 좀 지쳐 보였고.',
  excited: '신나 있는 게 다 보이더라.',
  calm: '담담하게 흘러간 하루였지.',
  regret: '아쉬움이 조금 남는 얼굴이었어.',
  flutter: '설레는 기색이 역력했고.',
  plain: '그냥 무던한 하루였어.',
}

const ESSAY_MOOD: Record<MoodKey, string> = {
  proud: '작게나마 스스로를 인정한 하루였다.',
  tired: '몸이 먼저 지쳐 버린 하루였다.',
  excited: '오랜만에 마음이 앞서는 날이었다.',
  calm: '아무 일도 일어나지 않은 듯 잔잔했다.',
  regret: '돌아서서 조금 아쉬웠다.',
  flutter: '설렘은 늘 예고 없이 찾아온다.',
  plain: '무던함도 나름의 기록이다.',
}

const BIO_MOOD: Record<MoodKey, string> = {
  proud: '그는 이날의 기분을 ‘뿌듯함’으로 남겼다.',
  tired: '그는 이날의 기분을 ‘지침’으로 남겼다.',
  excited: '그는 이날의 기분을 ‘신남’으로 남겼다.',
  calm: '그는 이날의 기분을 ‘담담함’으로 남겼다.',
  regret: '그는 이날의 기분을 ‘아쉬움’으로 남겼다.',
  flutter: '그는 이날의 기분을 ‘설렘’으로 남겼다.',
  plain: '그는 이날의 기분을 ‘무던함’으로 남겼다.',
}

const LETTER_MOOD: Record<MoodKey, string> = {
  proud: '그날의 너는 스스로가 조금 자랑스러웠대.',
  tired: '그날의 너는 많이 지쳐 있었어.',
  excited: '그날의 너는 오랜만에 신이 나 있었지.',
  calm: '그날의 너는 마음이 잔잔했어.',
  regret: '그날의 너는 조금 아쉬워했어.',
  flutter: '그날의 너는 설레고 있었어.',
  plain: '그날의 너는 무던하게 하루를 건넜어.',
}

function moodLine(tone: ToneKey, mood?: MoodKey): string {
  if (!mood) return ''
  if (tone === 'friend') return FRIEND_MOOD[mood]
  if (tone === 'essay') return ESSAY_MOOD[mood]
  if (tone === 'biography') return BIO_MOOD[mood]
  return LETTER_MOOD[mood]
}

function datePhrase(scene: Scene): string {
  const d = fromKey(scene.eventDate)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

function longDatePhrase(scene: Scene): string {
  const d = fromKey(scene.eventDate)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function sceneParagraph(tone: ToneKey, scene: Scene, persons: Person[]): string {
  const place = placeOf(scene)
  const time = timeOfDayWord(scene.startedAt)
  const people = peoplePhrase(scene, persons)
  const peopleSub = peopleSubject(scene, persons)
  const note = scene.userNote?.trim()
  const photos = photoPhrase(scene)
  const mood = moodLine(tone, scene.mood)
  const parts: string[] = []

  if (tone === 'friend') {
    parts.push(pick([`${datePhrase(scene)} ${time}엔 ${place}에 있었네.`, `${datePhrase(scene)}, ${time}에 ${place}에 다녀왔더라.`], scene.id))
    if (note) parts.push(`“${note}”라고 적어 뒀고.`)
    else if (photos) parts.push(`${photos}만 덩그러니 남아 있어.`)
    if (people) parts.push(`${people}도 같이 있었지.`)
    if (mood) parts.push(mood)
  } else if (tone === 'essay') {
    parts.push(`${datePhrase(scene)} ${time}, ${place}에서 시간을 보냈다.`)
    if (note) parts.push(`그날의 기록은 이렇다. “${note}”`)
    else if (photos) parts.push(`${photos}이 그날을 대신 기억하고 있다.`)
    if (people) parts.push(`그 자리에는 ${peopleSub} 함께 있었다.`)
    if (mood) parts.push(mood)
  } else if (tone === 'biography') {
    parts.push(`${longDatePhrase(scene)} ${time}, 그는 ${place}에 머물렀다.`)
    if (note) parts.push(`그는 이날을 이렇게 남겼다. “${note}”`)
    else if (photos) parts.push(`이날의 기록으로 ${photos}이 남아 있다.`)
    if (people) parts.push(`이 자리에는 ${peopleSub} 동행했다.`)
    if (mood) parts.push(mood)
  } else {
    parts.push(`${datePhrase(scene)}의 나에게. ${place}에서 보낸 ${time}이 기억나?`)
    if (note) parts.push(`너는 “${note}”라고 적어 두었어.`)
    else if (photos) parts.push(`${photos}이 그날의 너를 붙잡아 두고 있어.`)
    if (people) parts.push(`${people}의 얼굴도 떠오르네.`)
    if (mood) parts.push(mood)
  }
  return `[[e:${scene.id}]]${parts.join(' ')}`
}

function titleOf(tone: ToneKey, scenes: Scene[], start: string, end: string, kind: 'week' | 'month'): string {
  const s = fromKey(start)
  const e = fromKey(end)
  if (tone === 'friend') {
    if (kind === 'month') return `${s.getMonth() + 1}월, 우리가 나눈 이야기`
    return s.getMonth() === e.getMonth()
      ? `${s.getMonth() + 1}월 ${s.getDate()}일–${e.getDate()}일, 이런 일이 있었어`
      : `${s.getMonth() + 1}월의 마지막 날들, 이런 일이 있었어`
  }
  if (tone === 'essay') {
    return kind === 'month' ? `${s.getMonth() + 1}월의 장면들` : `${s.getMonth() + 1}월, 며칠의 기록`
  }
  if (tone === 'biography') {
    return kind === 'month' ? `${s.getFullYear()}년 ${s.getMonth() + 1}월, 기록된 나날` : `${s.getFullYear()}년 ${s.getMonth() + 1}월, 어느 한 주`
  }
  if (kind === 'month') return `${s.getMonth() + 1}월의 편지`
  return scenes.length > 0 ? `${formatMonthDay(scenes[0].eventDate)}의 편지` : `${s.getMonth() + 1}월의 편지`
}

function openingOf(tone: ToneKey, scenes: Scene[], start: string, end: string): string {
  const n = scenes.length
  const label = periodLabel(start, end)
  const places = [...new Set(scenes.map(placeOf))]
  const placeHint = places.slice(0, 2).join(', ')
  if (tone === 'friend') {
    return pick(
      [
        `${label}, 모두 ${n}개의 장면이 남았어. 거창한 일은 없었지만 그래서 더 우리답지. 하나씩 같이 봐.`,
        `기록을 펼쳐 보니까 ${n}개의 장면이 있더라. ${placeHint ? `${placeHint} 근처에서` : ''} 있었던 일들이야. 천천히 읽어 봐.`,
      ],
      `${start}-${n}`,
    )
  }
  if (tone === 'essay') {
    return `${label} 사이, ${n}개의 장면이 남았다. ${placeHint ? `${placeHint}에서 보낸 시간들이` : '크고 작은 시간들이'} 조용히 이어져 있다.`
  }
  if (tone === 'biography') {
    return `${label}는 그의 삶에서 ${n}개의 장면으로 기록되었다. 특별한 사건보다는, 반복되는 하루의 결이 두드러진 기간이었다.`
  }
  return `잘 지내고 있니, 나야. ${label}의 이야기를 조금 적어 두려고 해. ${n}개의 장면이 남아 있어.`
}

function closingOf(tone: ToneKey): string {
  if (tone === 'friend') return '뭐, 별일 없는 한 주였지만 이렇게 적어 두니까 좀 웃기네. 다음 주에도 틈나면 또 남겨 볼게.'
  if (tone === 'essay') return '특별할 것 없는 날들이 이렇게 한 줄씩 쌓이면, 어느새 한 사람의 시간이 된다.'
  if (tone === 'biography') return '이 기간의 기록은 여기서 끝난다. 다음 장면은 아직 쓰이지 않았다.'
  return '오늘의 너에게, 잘하고 있다고 말해 주고 싶어. 다음 편지에서 또 만나.'
}

export function composeLocalChapter(opts: {
  toneKey: ToneKey
  scenes: Scene[]
  persons: Person[]
  periodStart: string
  periodEnd: string
  kind: 'week' | 'month'
}): ChapterDraft {
  const scenes = sortScenes(opts.scenes)
  const title = titleOf(opts.toneKey, scenes, opts.periodStart, opts.periodEnd, opts.kind)
  const body = [
    openingOf(opts.toneKey, scenes, opts.periodStart, opts.periodEnd),
    ...scenes.map((scene) => sceneParagraph(opts.toneKey, scene, opts.persons)),
    closingOf(opts.toneKey),
  ]
  const places = [...new Set(scenes.map(placeOf))].slice(0, 3).join(', ')
  const summary = `${periodLabel(opts.periodStart, opts.periodEnd)} · 장면 ${scenes.length}개${places ? ` · ${places}` : ''}`
  return {
    title,
    bodyMd: body.join('\n\n'),
    summary,
    eventIds: scenes.map((s) => s.id),
  }
}

/** Gemini가 돌려준 문단에 장면 연결이 없을 때, 근거 장면 목록만 따로 보관한다. */
export function stripSceneMarkers(text: string): string {
  return text.replace(/\[\[e:[^\]]+\]\]/g, '').trim()
}

export function chapterPreview(chapter: Chapter): string {
  const body = stripSceneMarkers(chapter.bodyMd).split('\n\n')[1] ?? ''
  return body.length > 80 ? `${body.slice(0, 80)}…` : body
}

export const toneLabel = (key: ToneKey) => toneOf(key).label
export const moodLabel = (key?: MoodKey) => (key ? moodOf(key)?.label ?? '' : '')
