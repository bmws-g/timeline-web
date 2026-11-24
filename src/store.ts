import { computed, reactive, watch } from 'vue'
import type { AppState, Chapter, Person, Scene, SceneDraft, ToneKey } from './types'
import { buildDemo } from './data/demo'
import { composeLocalChapter } from './lib/narrative'
import { requestGeminiChapter } from './lib/gemini'
import { sceneFromDraft } from './lib/scene'
import { toKey } from './lib/date'
import { uid } from './lib/id'

const STORAGE_KEY = 'timeline.state.v1'
const STATE_VERSION = 1

function defaultState(): AppState {
  return {
    version: STATE_VERSION,
    onboarded: false,
    toneKey: 'essay',
    interviewTime: '21:30',
    persons: [],
    scenes: [],
    chapters: [],
    settings: { geminiKey: '', useAI: false },
  }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      ...defaultState(),
      ...parsed,
      settings: { ...defaultState().settings, ...(parsed.settings ?? {}) },
      persons: parsed.persons ?? [],
      scenes: parsed.scenes ?? [],
      chapters: parsed.chapters ?? [],
    }
  } catch {
    return defaultState()
  }
}

export const state = reactive<AppState>(loadState())

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

export const ui = reactive({
  sceneSheetId: null as string | null,
  toast: null as Toast | null,
  storageWarning: false,
  generating: false,
  ready: false,
})

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(message: string, tone: Toast['tone'] = 'info') {
  ui.toast = { id: Date.now(), message, tone }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    ui.toast = null
  }, 2800)
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      ui.storageWarning = false
    } catch {
      ui.storageWarning = true
    }
  }, 180)
}

watch(state, scheduleSave, { deep: true })

export function completeOnboarding(opts: { toneKey: ToneKey; interviewTime: string; withDemo: boolean }) {
  state.toneKey = opts.toneKey
  state.interviewTime = opts.interviewTime
  if (opts.withDemo) loadDemo(opts.toneKey)
  state.onboarded = true
  scheduleSave()
}

export function setTone(toneKey: ToneKey) {
  state.toneKey = toneKey
  toast('자서전 톤을 바꿨어요. 새로 쓰는 글부터 적용됩니다.', 'success')
}

/* ── 인물 ─────────────────────────────────────────────── */

function normalize(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

export function findPersonByName(name: string): Person | undefined {
  const target = normalize(name)
  return state.persons.find(
    (p) => normalize(p.displayName) === target || p.aliases.some((a) => normalize(a) === target),
  )
}

export function addPerson(displayName: string, disambiguator?: string): Person | null {
  const name = displayName.trim()
  if (!name) return null
  const existing = findPersonByName(name)
  if (existing) return existing
  const person: Person = {
    id: uid(),
    displayName: name,
    disambiguator: disambiguator?.trim() || undefined,
    aliases: [],
    createdAt: new Date().toISOString(),
  }
  state.persons.push(person)
  return person
}

export function addAlias(personId: string, alias: string) {
  const person = state.persons.find((p) => p.id === personId)
  const value = alias.trim()
  if (!person || !value) return
  if (person.aliases.some((a) => normalize(a) === normalize(value))) return
  person.aliases.push(value)
}

export function removeAlias(personId: string, alias: string) {
  const person = state.persons.find((p) => p.id === personId)
  if (!person) return
  person.aliases = person.aliases.filter((a) => a !== alias)
}

export function updatePerson(personId: string, patch: Partial<Pick<Person, 'displayName' | 'disambiguator' | 'note'>>) {
  const person = state.persons.find((p) => p.id === personId)
  if (!person) return
  Object.assign(person, patch)
}

export function removePerson(personId: string) {
  state.persons = state.persons.filter((p) => p.id !== personId)
  for (const scene of state.scenes) {
    scene.personIds = scene.personIds.filter((id) => id !== personId)
  }
  toast('인물을 삭제했어요.', 'info')
}

export function personName(id: string): string {
  return state.persons.find((p) => p.id === id)?.displayName ?? '이름 없음'
}

/* ── 장면 ─────────────────────────────────────────────── */

export function addScenes(drafts: SceneDraft[]): Scene[] {
  const created = drafts.map(sceneFromDraft)
  state.scenes.push(...created)
  return created
}

export function updateScene(sceneId: string, patch: Partial<Scene>) {
  const scene = state.scenes.find((s) => s.id === sceneId)
  if (!scene) return
  Object.assign(scene, patch)
  if (patch.userNote !== undefined) {
    scene.interviewState = patch.userNote.trim() ? 'answered' : 'pending'
  }
}

export function saveInterview(sceneId: string, payload: { note: string; mood?: Scene['mood']; personIds: string[] }) {
  const scene = state.scenes.find((s) => s.id === sceneId)
  if (!scene) return
  scene.userNote = payload.note.trim() || undefined
  scene.mood = payload.mood
  scene.personIds = [...payload.personIds]
  scene.interviewState = scene.userNote ? 'answered' : 'skipped'
  toast(scene.userNote ? '한 줄을 책에 남겼어요.' : '이번 장면은 건너뛸게요.', 'success')
}

export function removeScene(sceneId: string) {
  state.scenes = state.scenes.filter((s) => s.id !== sceneId)
  state.chapters = state.chapters.map((chapter) => ({
    ...chapter,
    eventIds: chapter.eventIds.filter((id) => id !== sceneId),
  }))
  toast('장면을 삭제했어요.', 'info')
}

export const sceneById = (id: string) => state.scenes.find((s) => s.id === id)

/* ── 챕터 ─────────────────────────────────────────────── */

export async function generateChapter(opts: {
  kind: 'week' | 'month'
  periodStart: string
  periodEnd: string
  toneKey: ToneKey
}): Promise<{ chapter?: Chapter; warning?: string; error?: string }> {
  const scenes = state.scenes
    .filter((s) => s.eventDate >= opts.periodStart && s.eventDate <= opts.periodEnd)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  if (scenes.length === 0) {
    return { error: '이 기간에는 장면이 없어요. 사진을 올리거나 직접 장면을 만들어 보세요.' }
  }

  ui.generating = true
  try {
    let draft = composeLocalChapter({
      toneKey: opts.toneKey,
      scenes,
      persons: state.persons,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      kind: opts.kind,
    })
    let generatedBy: Chapter['generatedBy'] = 'local'
    let warning: string | undefined

    if (state.settings.useAI && state.settings.geminiKey.trim()) {
      try {
        const ai = await requestGeminiChapter({
          apiKey: state.settings.geminiKey,
          toneKey: opts.toneKey,
          scenes,
          persons: state.persons,
          periodLabel: draft.summary,
        })
        draft = {
          title: ai.title || draft.title,
          bodyMd: ai.bodyMd,
          summary: ai.summary || draft.summary,
          eventIds: draft.eventIds,
        }
        generatedBy = 'gemini'
      } catch (err) {
        warning = `AI 호출에 실패해 로컬 문장으로 썼어요. (${(err as Error).message.slice(0, 120)})`
      }
    }

    const previous = state.chapters.filter(
      (c) => c.kind === opts.kind && c.periodStart === opts.periodStart,
    )
    const version = previous.reduce((max, c) => Math.max(max, c.version), 0) + 1
    const chapter: Chapter = {
      id: uid(),
      kind: opts.kind,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      seq: previous.length + 1,
      title: draft.title,
      bodyMd: draft.bodyMd,
      summary: draft.summary,
      toneKey: opts.toneKey,
      eventIds: draft.eventIds,
      coverSceneId: scenes[0]?.id,
      status: 'published',
      version,
      generatedBy,
      createdAt: new Date().toISOString(),
    }
    state.chapters.push(chapter)
    toast(generatedBy === 'gemini' ? 'AI가 한 편을 썼어요.' : '한 편을 엮었어요.', 'success')
    return { chapter, warning }
  } finally {
    ui.generating = false
  }
}

export function saveChapterBody(chapterId: string, body: string) {
  const chapter = state.chapters.find((c) => c.id === chapterId)
  if (!chapter) return
  chapter.bodyMd = body
  chapter.status = 'edited'
  toast('문장을 다듬었어요.', 'success')
}

export function removeChapter(chapterId: string) {
  state.chapters = state.chapters.filter((c) => c.id !== chapterId)
  toast('챕터를 삭제했어요.', 'info')
}

export function latestChapters(): Chapter[] {
  const map = new Map<string, Chapter>()
  for (const chapter of state.chapters) {
    const key = `${chapter.kind}:${chapter.periodStart}`
    const current = map.get(key)
    if (!current || chapter.version > current.version) map.set(key, chapter)
  }
  return [...map.values()].sort((a, b) => b.periodStart.localeCompare(a.periodStart))
}

/* ── 샘플·백업 ────────────────────────────────────────── */

export function loadDemo(toneKey: ToneKey = state.toneKey) {
  clearSample(true)
  const demo = buildDemo(toneKey)
  state.persons.push(...demo.persons)
  state.scenes.push(...demo.scenes)
  state.chapters.push(...demo.chapters)
  toast('샘플 기록을 채웄어요. 마음껏 둘러보세요.', 'success')
}

export function clearSample(silent = false) {
  state.scenes = state.scenes.filter((s) => !s.sample)
  state.chapters = state.chapters.filter((c) => !c.sample)
  state.persons = state.persons.filter((p) => !p.sample)
  const sceneIds = new Set(state.scenes.map((s) => s.id))
  const personIds = new Set(state.persons.map((p) => p.id))
  state.chapters = state.chapters
    .map((c) => ({ ...c, eventIds: c.eventIds.filter((id) => sceneIds.has(id)) }))
    .filter((c) => c.eventIds.length > 0)
  for (const scene of state.scenes) {
    scene.personIds = scene.personIds.filter((id) => personIds.has(id))
  }
  if (!silent) toast('샘플 기록을 지웠어요.', 'info')
}

export function hasSample(): boolean {
  return state.scenes.some((s) => s.sample) || state.persons.some((p) => p.sample)
}

export function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `timeline-backup-${toKey(new Date())}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast('백업 파일을 내려받았어요.', 'success')
}

export function importJson(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Partial<AppState>
    if (!parsed || !Array.isArray(parsed.scenes) || !Array.isArray(parsed.persons)) {
      throw new Error('형식이 맞지 않습니다.')
    }
    state.onboarded = Boolean(parsed.onboarded)
    state.toneKey = (parsed.toneKey as ToneKey) ?? 'essay'
    if (parsed.interviewTime) state.interviewTime = parsed.interviewTime
    state.persons = parsed.persons
    state.scenes = parsed.scenes
    state.chapters = parsed.chapters ?? []
    state.settings = { ...defaultState().settings, ...(parsed.settings ?? {}) }
    toast('백업을 불러왔어요.', 'success')
    return true
  } catch (err) {
    toast(`불러오지 못했어요: ${(err as Error).message}`, 'error')
    return false
  }
}

export function resetAll() {
  const fresh = defaultState()
  Object.assign(state, fresh)
  ui.storageWarning = false
  toast('모든 데이터를 지웠어요.', 'info')
}

/* ── 파생 값 ──────────────────────────────────────────── */

export const scenesSorted = computed(() =>
  [...state.scenes].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
)

export const pendingScenes = computed(() =>
  scenesSorted.value.filter((s) => s.interviewState === 'pending'),
)

export const personStats = computed(() =>
  state.persons
    .map((person) => {
      const scenes = state.scenes
        .filter((s) => s.personIds.includes(person.id))
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
      return {
        person,
        count: scenes.length,
        lastSeenOn: scenes[0]?.eventDate,
        firstSeenOn: scenes[scenes.length - 1]?.eventDate,
      }
    })
    .sort((a, b) => (b.lastSeenOn ?? '').localeCompare(a.lastSeenOn ?? '')),
)
