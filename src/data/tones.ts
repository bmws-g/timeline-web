import type { MoodKey, ToneKey } from '../types'

export interface MoodPreset {
  key: MoodKey
  label: string
  emoji: string
  tone: string
}

export const MOODS: MoodPreset[] = [
  { key: 'proud', label: '뿌듯', emoji: '🌱', tone: '#4f7a53' },
  { key: 'excited', label: '신남', emoji: '✨', tone: '#b4762a' },
  { key: 'flutter', label: '설렘', emoji: '💗', tone: '#b4586b' },
  { key: 'calm', label: '담담', emoji: '☁️', tone: '#5f7186' },
  { key: 'tired', label: '지침', emoji: '🌙', tone: '#6a6486' },
  { key: 'regret', label: '아쉬움', emoji: '🍂', tone: '#8d6a45' },
  { key: 'plain', label: '무던', emoji: '⚪', tone: '#7d7469' },
]

export function moodOf(key?: MoodKey): MoodPreset | undefined {
  return MOODS.find((m) => m.key === key)
}

export interface TonePreset {
  key: ToneKey
  label: string
  short: string
  tagline: string
  description: string
  /** 온보딩에서 같은 장면을 이 톤으로 쓴 미리보기 */
  sample: string
  /** 밤 1줄 인터뷰 질문의 말투 */
  interview: (place?: string) => string
  /** Gemini system instruction */
  system: string
  /** Gemini user prompt 앞에 붙는 지시 */
  instruction: string
}

const SAMPLE_PLACE = '신림동의 작은 카페'

export const TONES: TonePreset[] = [
  {
    key: 'friend',
    label: '친구에게 말하듯',
    short: '친구',
    tagline: '편한 반말, 농담 섞인 톤',
    description: '오랜 친구에게 오늘 있었던 일을 털어놓는 말투. 잘난 척도 없고, 포장도 없습니다.',
    sample:
      '야, 수요일엔 신림 카페에서 두 시간이나 앉아 있었더라. 노트북은 켜 놨는데 반은 딴짓했지, 뭐. 그래도 미뤄 둔 일 하나는 끝냈으니까 오늘은 봐준다.',
    interview: (place) => `오늘 ${place ?? '여기'}에 있었네, 거기서 뭐 했어?`,
    system:
      '당신은 사용자의 오랜 친구입니다. 사용자가 남긴 장면 기록을 1인칭 반말로, 농담과 솔직함을 섞어 편하게 들려주세요. 제공된 사실 밖의 내용은 절대 만들지 않습니다.',
    instruction:
      '아래 장면들을 친구에게 말하듯 한 편의 글로 써 주세요. 반말, 짧은 문장, 적당한 추임새. 날짜와 장소는 사실대로만 쓰고, 없는 일은 만들지 마세요.',
  },
  {
    key: 'essay',
    label: '담담한 에세이',
    short: '에세이',
    tagline: '차분하고 정돈된 문장',
    description: '감정을 앞세우지 않고, 그날의 공기와 장면을 천천히 비추는 톤.',
    sample:
      '11월 18일, 신림의 작은 카페에서 두 시간을 보냈다. 창가 자리에 앉아 노트북을 열었지만 생각보다 많은 시간을 창밖을 보며 흘려보냈다. 미뤄 둔 일 하나를 끝낸 것으로 그날은 충분했다.',
    interview: (place) => `오늘 ${place ?? '그곳'}에서의 시간은 어땠나요?`,
    system:
      '당신은 담담한 문체의 에세이스트입니다. 제공된 장면 기록만으로 1인칭 에세이를 씁니다. 과장된 감정이나 사실 창작 없이, 관찰과 여백으로 씁니다.',
    instruction:
      '아래 장면들을 담담한 1인칭 에세이로 엮어 주세요. 짧은 문단, 구체적인 관찰, 절제된 감정. 제공되지 않은 사실은 쓰지 마세요.',
  },
  {
    key: 'biography',
    label: '전기 작가',
    short: '전기',
    tagline: '묵직하고 객관적인 서술',
    description: '한 사람의 삶을 기록하는 전기 작가의 시선. 3인칭으로 정돈해 씁니다.',
    sample:
      '2026년 11월 18일 오후, 그는 신림의 한 카페에 두 시간 머물렀다. 노트북을 펼쳤으나 집중은 오래 이어지지 않았고, 그날의 성과는 오래 미뤄 둔 업무 하나를 마무리한 것이었다.',
    interview: (place) => `오늘 ${place ?? '그곳'}에서 보낸 시간을 한 줄로 남긴다면 무엇입니까?`,
    system:
      '당신은 한 사람의 삶을 기록하는 전기 작가입니다. 사용자의 장면 기록을 3인칭 관찰자의 시점으로, 사실에 근거해 묵직하게 서술합니다. 추측과 창작은 하지 않습니다.',
    instruction:
      '아래 장면들을 3인칭 전기 문체로 엮어 주세요. 날짜·시간·장소는 기록 그대로, 감정은 행동과 기록에 근거해서만. 제공되지 않은 사실은 쓰지 마세요.',
  },
  {
    key: 'warm_letter',
    label: '감성 기록',
    short: '편지',
    tagline: '따뜻한 편지 같은 말',
    description: '몇 년 뒤의 내가 읽을 편지처럼, 다정하고 조금은 느린 문장.',
    sample:
      '11월 18일의 나에게. 신림의 작은 카페, 창가 자리에서 두 시간을 보냈어. 딴생각이 많았던 오후였지만, 미뤄 둔 일 하나를 끝낸 너를 나는 조금 자랑스러워했어.',
    interview: (place) => `오늘 ${place ?? '그곳'}의 나에게 한 줄 남긴다면?`,
    system:
      '당신은 사용자가 미래의 자신에게 보내는 편지를 대신 써 주는 사람입니다. 다정한 2인칭 또는 1인칭 편지체로, 제공된 장면 기록만을 재료로 씁니다.',
    instruction:
      '아래 장면들을 미래의 나에게 보내는 편지처럼 써 주세요. 다정하고 느린 문장, 마지막에 안부 한 줄. 제공되지 않은 사실은 쓰지 마세요.',
  },
]

export function toneOf(key: ToneKey): TonePreset {
  return TONES.find((t) => t.key === key) ?? TONES[1]
}

export const SAMPLE_SCENE = {
  date: '2026년 11월 18일 수요일',
  place: SAMPLE_PLACE,
}
