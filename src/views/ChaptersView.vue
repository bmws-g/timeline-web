<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import BookCard from '../components/BookCard.vue'
import { TONES } from '../data/tones'
import { addDays, monthRangeOf, periodLabel, weekRangeOf } from '../lib/date'
import { generateChapter, latestChapters, setTone, state, toast, ui } from '../store'

const router = useRouter()
const selected = ref<'this-week' | 'last-week' | 'this-month'>(
  (() => {
    const now = new Date()
    const ranges = [weekRangeOf(now), weekRangeOf(addDays(now, -7)), monthRangeOf(now)]
    const keys = ['this-week', 'last-week', 'this-month'] as const
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i]
      if (state.scenes.some((s) => s.eventDate >= range.start && s.eventDate <= range.end)) return keys[i]
    }
    return 'this-week'
  })(),
)

interface PeriodOption {
  key: 'this-week' | 'last-week' | 'this-month'
  label: string
  kind: 'week' | 'month'
  start: string
  end: string
}

const periods = computed<PeriodOption[]>(() => {
  const now = new Date()
  const thisWeek = weekRangeOf(now)
  const lastWeek = weekRangeOf(addDays(now, -7))
  const month = monthRangeOf(now)
  return [
    { key: 'this-week', label: '이번 주', kind: 'week', ...thisWeek },
    { key: 'last-week', label: '지난주', kind: 'week', ...lastWeek },
    { key: 'this-month', label: '이번 달', kind: 'month', ...month },
  ]
})

const current = computed(() => periods.value.find((p) => p.key === selected.value) ?? periods.value[0])
const chapters = computed(() => latestChapters())
const aiReady = computed(() => state.settings.useAI && Boolean(state.settings.geminiKey.trim()))

const sceneCount = computed(
  () => state.scenes.filter((s) => s.eventDate >= current.value.start && s.eventDate <= current.value.end).length,
)

const existing = computed(() => {
  const list = state.chapters
    .filter((c) => c.kind === current.value.kind && c.periodStart === current.value.start)
    .sort((a, b) => b.version - a.version)
  return list[0]
})

const canGenerate = computed(() => sceneCount.value > 0 && !ui.generating)

async function generate() {
  const period = current.value
  const result = await generateChapter({
    kind: period.kind,
    periodStart: period.start,
    periodEnd: period.end,
    toneKey: state.toneKey,
  })
  if (result.error) {
    toast(result.error, 'error')
    return
  }
  if (result.warning) toast(result.warning, 'error')
  if (result.chapter) router.push(`/book/${result.chapter.id}`)
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div>
        <p class="eyebrow">나의 책</p>
        <h1 style="font-size: 24px; margin-top: 2px">자서전 챕터</h1>
      </div>
      <router-link to="/settings" class="icon-btn" aria-label="설정">
        <Icon name="gear" :size="19" />
      </router-link>
    </header>

    <section class="hero" style="padding: 20px">
      <p class="eyebrow">한 편 엮기</p>
      <h2 style="font-family: var(--serif); font-size: 22px; margin-top: 6px; line-height: 1.4">
        {{ current.label }}의 장면을<br />한 편의 글로 씁니다
      </h2>
      <p class="small muted" style="margin-top: 6px">{{ periodLabel(current.start, current.end) }}</p>

      <div class="chip-row" style="margin-top: 14px">
        <button
          v-for="period in periods"
          :key="period.key"
          class="chip"
          :class="{ 'chip--active': selected === period.key }"
          @click="selected = period.key"
        >
          {{ period.label }}
        </button>
      </div>

      <div class="chip-row" style="margin-top: 10px">
        <button
          v-for="item in TONES"
          :key="item.key"
          class="chip chip--sm"
          :class="{ 'chip--active': state.toneKey === item.key }"
          @click="setTone(item.key)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="row-between" style="margin-top: 16px; padding-top: 14px; border-top: 1px dashed rgba(120, 90, 60, 0.25)">
        <div>
          <p style="font-weight: 600; font-size: 14px">이 기간의 장면 {{ sceneCount }}개</p>
          <p class="tiny muted">
            {{ aiReady ? 'Gemini가 선택한 톤으로 씁니다' : '로컬 문장 조합기로 바로 씁니다' }}
          </p>
        </div>
        <button class="btn btn--accent" :disabled="!canGenerate" @click="generate">
          <Icon :name="ui.generating ? 'refresh' : 'sparkles'" :size="16" />
          {{ ui.generating ? '쓰는 중…' : existing ? '다시 엮기' : '한 편 엮기' }}
        </button>
      </div>

      <p v-if="sceneCount === 0" class="hint" style="margin-top: 10px">
        이 기간에는 아직 장면이 없어요. <router-link to="/add" style="color: var(--accent); text-decoration: underline">사진으로 장면 만들기 →</router-link>
      </p>
      <p v-else-if="!aiReady" class="hint" style="margin-top: 10px">
        설정에서 Gemini API 키를 넣으면 같은 장면을 실제 AI 문장으로 씁니다. 키가 없어도 지금 바로 쓸 수 있어요.
      </p>
      <p v-else class="hint" style="margin-top: 10px">
        AI가 쓴 글에는 ‘AI’ 배지가 붙습니다. 실패하면 자동으로 로컬 문장으로 돌아갑니다.
      </p>
    </section>

    <div class="section-head">
      <h2>엮은 글 {{ chapters.length }}편</h2>
      <span class="more">최신 버전만 표시</span>
    </div>

    <div v-if="chapters.length" class="stack">
      <BookCard v-for="chapter in chapters" :key="chapter.id" :chapter="chapter" />
    </div>

    <div v-else class="empty">
      <svg class="empty__art" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="1.4">
        <path d="M24 18h48a6 6 0 0 1 6 6v50H30a6 6 0 0 1-6-6V18Z" />
        <path d="M78 24h12a6 6 0 0 1 6 6v44H78" />
        <path d="M36 34h24M36 44h18" stroke-linecap="round" />
      </svg>
      <h3>아직 엮은 글이 없어요</h3>
      <p>위에서 기간을 고르고 ‘한 편 엮기’를 누르면<br />장면들이 고른 톤의 글로 정리됩니다.</p>
    </div>

    <p class="hint" style="margin-top: 22px; text-align: center">
      챕터는 장면을 고치지 않는 파생물이에요. 톤을 바꿔 다시 엮어도 원래 기록은 그대로 남습니다.
    </p>
  </div>
</template>
