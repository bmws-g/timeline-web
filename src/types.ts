/** 타임라인 MVP 데이터 모델 — ideas/timeline-mvp-schema.sql 과 1:1로 대응합니다. */

export type ToneKey = 'friend' | 'essay' | 'biography' | 'warm_letter'

export type MoodKey = 'proud' | 'tired' | 'excited' | 'calm' | 'regret' | 'flutter' | 'plain'

export type SourceType = 'photo' | 'manual'

export type InterviewState = 'pending' | 'answered' | 'skipped'

export interface PhotoMeta {
  id: string
  name: string
  /** 브라우저에서 만든 축소 썸네일 (data URL). 원본 사진은 저장하지 않습니다. */
  thumb: string
  /** EXIF DateTimeOriginal (ISO) */
  takenAt?: string
  lat?: number
  lng?: number
  width?: number
  height?: number
}

export interface Person {
  id: string
  displayName: string
  /** 동명이인 구분: '회사' · '대학' · '가족' */
  disambiguator?: string
  note?: string
  /** 호칭 이력 (김대리 → 김과장 → 예전 동료) */
  aliases: string[]
  createdAt: string
  /** 샘플 데이터 여부 */
  sample?: boolean
}

/** events 테이블: 하루의 장면(Scene) */
export interface Scene {
  id: string
  /** 사용자 로컬 날짜 YYYY-MM-DD */
  eventDate: string
  startedAt: string
  title: string
  locationName?: string
  lat?: number
  lng?: number
  /** 사진·시간·장소로 만든 건조한 사실 문장 */
  autoSummary: string
  /** 1줄 인터뷰 답변 */
  userNote?: string
  mood?: MoodKey
  personIds: string[]
  photos: PhotoMeta[]
  sourceType: SourceType
  isHighlight: boolean
  interviewState: InterviewState
  createdAt: string
  sample?: boolean
}

/** chapters 테이블: 주간/월간 자서전 (원본을 고치지 않는 파생물) */
export interface Chapter {
  id: string
  kind: 'week' | 'month'
  periodStart: string
  periodEnd: string
  seq: number
  title: string
  bodyMd: string
  summary: string
  toneKey: ToneKey
  eventIds: string[]
  coverSceneId?: string
  status: 'published' | 'edited'
  version: number
  generatedBy: 'local' | 'gemini'
  createdAt: string
  sample?: boolean
}

export interface Settings {
  geminiKey: string
  useAI: boolean
}

export interface AppState {
  version: number
  onboarded: boolean
  toneKey: ToneKey
  interviewTime: string
  persons: Person[]
  scenes: Scene[]
  chapters: Chapter[]
  settings: Settings
}

/** 사진 업로드 후 아직 장면으로 저장되지 않은 초안 */
export interface SceneDraft {
  key: string
  eventDate: string
  startedAt: string
  locationName: string
  lat?: number
  lng?: number
  photos: PhotoMeta[]
  note: string
}
