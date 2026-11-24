import type { Person, Scene, ToneKey } from '../types'
import { toneOf } from '../data/tones'
import { formatDateLong, timeOfDayWord } from './date'

export const GEMINI_MODEL = 'gemini-2.5-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface GeminiDraft {
  title: string
  bodyMd: string
  summary: string
}

function sceneFacts(scene: Scene, persons: Person[]) {
  return {
    date: formatDateLong(scene.eventDate),
    time: timeOfDayWord(scene.startedAt),
    place: scene.locationName ?? null,
    photoCount: scene.photos.length,
    oneLineNote: scene.userNote ?? null,
    mood: scene.mood ?? null,
    people: scene.personIds
      .map((id) => persons.find((p) => p.id === id)?.displayName)
      .filter((name): name is string => Boolean(name)),
    autoSummary: scene.autoSummary,
  }
}

/** 사용자가 브라우저 설정에 넣은 키로만 호출한다. 키는 이 기기 localStorage에만 남는다. */
export async function requestGeminiChapter(opts: {
  apiKey: string
  toneKey: ToneKey
  scenes: Scene[]
  persons: Person[]
  periodLabel: string
}): Promise<GeminiDraft> {
  const tone = toneOf(opts.toneKey)
  const payload = {
    system_instruction: { parts: [{ text: tone.system }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              tone.instruction,
              '',
              `기간: ${opts.periodLabel}`,
              '장면 기록(JSON):',
              JSON.stringify(opts.scenes.map((s) => sceneFacts(s, opts.persons)), null, 2),
              '',
              '출력은 아래 JSON 형식만. 설명이나 코드펜스 없이 JSON만 출력하세요.',
              '{"title": "제목", "body": "문단을 빈 줄로 구분한 본문", "summary": "카드에 보일 한 줄 요약"}',
            ].join('\n'),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  }

  const res = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': opts.apiKey.trim(),
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 240)}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text.trim()) throw new Error('Gemini가 빈 응답을 돌려주었습니다.')

  return parseDraft(text)
}

function parseDraft(text: string): GeminiDraft {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { title?: string; body?: string; bodyMd?: string; summary?: string }
    const bodyValue = parsed.body ?? parsed.bodyMd
    if (bodyValue && parsed.title) {
      return {
        title: String(parsed.title),
        bodyMd: String(bodyValue),
        summary: String(parsed.summary ?? '').slice(0, 160),
      }
    }
  } catch {
    // 아래 폴백으로
  }
  const paragraphs = cleaned.split(/\n{2,}/).filter(Boolean)
  return {
    title: paragraphs[0]?.replace(/^#+\s*/, '').slice(0, 60) ?? '기록',
    bodyMd: paragraphs.slice(1).join('\n\n') || cleaned,
    summary: '',
  }
}

/** 키 유효성만 확인한다 (모델 목록 조회, 생성 호출 없음 → 과금 없음). */
export async function verifyGeminiKey(apiKey: string): Promise<boolean> {
  if (!apiKey.trim()) return false
  const res = await fetch(`${ENDPOINT}?pageSize=1`, {
    headers: { 'x-goog-api-key': apiKey.trim() },
  })
  return res.ok
}
