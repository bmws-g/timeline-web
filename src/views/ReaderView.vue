<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import { TONES, toneOf } from '../data/tones'
import { formatDate, periodLabel } from '../lib/date'
import { stripSceneMarkers } from '../lib/narrative'
import { generateChapter, removeChapter, saveChapterBody, state, toast, ui } from '../store'
import type { ToneKey } from '../types'

const route = useRoute()
const router = useRouter()

const chapter = computed(() => state.chapters.find((c) => c.id === route.params.id) ?? null)
const tone = computed(() => (chapter.value ? toneOf(chapter.value.toneKey) : TONES[1]))

const blocks = computed(() => {
  const body = chapter.value?.bodyMd ?? ''
  return body
    .split(/\n{2,}/)
    .map((raw) => {
      const match = raw.match(/^\[\[e:([^\]]+)\]\]\s*/)
      return {
        text: stripSceneMarkers(raw).trim(),
        sceneId: match?.[1] as string | undefined,
      }
    })
    .filter((b) => b.text.length > 0)
})

const evidence = computed(() => {
  if (!chapter.value) return []
  return chapter.value.eventIds
    .map((id) => state.scenes.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
})

const editing = ref(false)
const editBody = ref('')
const pickingTone = ref(false)
const confirmingDelete = ref(false)

function openScene(id: string) {
  ui.sceneSheetId = id
}

function beginEdit() {
  if (!chapter.value) return
  editBody.value = stripSceneMarkers(chapter.value.bodyMd).split(/\n{2,}/).join('\n\n')
  editing.value = true
}

function saveEdit() {
  if (!chapter.value) return
  saveChapterBody(chapter.value.id, editBody.value)
  editing.value = false
}

async function rewrite(toneKey: ToneKey) {
  const current = chapter.value
  if (!current) return
  pickingTone.value = false
  const result = await generateChapter({
    kind: current.kind,
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    toneKey,
  })
  if (result.error) {
    toast(result.error, 'error')
    return
  }
  if (result.warning) toast(result.warning, 'error')
  if (result.chapter) router.replace(`/book/${result.chapter.id}`)
}

function remove() {
  const current = chapter.value
  if (!current) return
  removeChapter(current.id)
  router.replace('/book')
}
</script>

<template>
  <div v-if="chapter" class="reader">
    <div class="reader__top">
      <router-link to="/book" class="icon-btn" aria-label="책 목록으로">
        <Icon name="chevron-left" :size="18" />
      </router-link>
      <span class="tiny muted">{{ chapter.kind === 'week' ? '주간 단편' : '월간 기록' }}</span>
      <div class="row" style="gap: 4px">
        <button class="icon-btn icon-btn--plain" aria-label="문장 고치기" @click="beginEdit">
          <Icon name="pencil" :size="17" />
        </button>
        <button class="icon-btn icon-btn--plain" aria-label="챕터 삭제" @click="confirmingDelete = true">
          <Icon name="trash" :size="17" />
        </button>
      </div>
    </div>

    <header class="reader__cover">
      <p class="reader__period">{{ periodLabel(chapter.periodStart, chapter.periodEnd) }}</p>
      <h1 class="reader__title">{{ chapter.title }}</h1>
      <div class="reader__byline">
        <span>{{ tone.label }}</span>
        <span>·</span>
        <span>장면 {{ chapter.eventIds.length }}개</span>
        <span>·</span>
        <span>{{ formatDate(chapter.createdAt.slice(0, 10)) }} 엮음</span>
        <span v-if="chapter.version > 1" class="badge">v{{ chapter.version }}</span>
        <span v-if="chapter.generatedBy === 'gemini'" class="badge badge--accent">AI</span>
        <span v-if="chapter.status === 'edited'" class="badge badge--green">다듬음</span>
      </div>
    </header>

    <div v-if="confirmingDelete" class="card card--flat" style="margin-top: 16px; border-color: #efd6cf; background: #fdf4f1">
      <p class="small" style="color: #8d2f24">이 챕터를 삭제할까요? 원본 장면은 그대로 남습니다.</p>
      <div class="row" style="margin-top: 10px; justify-content: flex-end">
        <button class="btn btn--sm btn--quiet" @click="confirmingDelete = false">취소</button>
        <button class="btn btn--sm btn--danger" @click="remove">삭제</button>
      </div>
    </div>

    <div v-if="editing" class="card" style="margin-top: 18px">
      <p class="label" style="margin-bottom: 8px">문장 다듬기</p>
      <textarea v-model="editBody" class="textarea" rows="14" style="font-family: var(--serif); font-size: 15.5px; line-height: 1.8" />
      <div class="row" style="margin-top: 10px; justify-content: flex-end">
        <button class="btn btn--sm btn--quiet" @click="editing = false">취소</button>
        <button class="btn btn--sm btn--primary" @click="saveEdit">저장</button>
      </div>
    </div>

    <article v-else class="reader__body">
      <p
        v-for="(block, index) in blocks"
        :key="index"
        class="reader__p"
        :class="{ 'reader__p--lede': index === 0, 'reader__p--linked': block.sceneId }"
        :title="block.sceneId ? '이 문단의 장면 열기' : undefined"
        @click="block.sceneId && openScene(block.sceneId)"
      >
        {{ block.text }}
      </p>
    </article>

    <footer class="reader__foot">
      <div class="row-between">
        <p class="eyebrow eyebrow--muted">이 글의 근거 장면</p>
        <span class="tiny muted">{{ evidence.length }}개</span>
      </div>
      <div class="evidence" style="margin-top: 10px">
        <button v-for="scene in evidence" :key="scene.id" class="evidence-item" @click="openScene(scene.id)">
          <img v-if="scene.photos[0]" :src="scene.photos[0].thumb" alt="" />
          <span v-else class="evidence-item__thumb"><Icon name="image" :size="16" /></span>
          <span class="grow">
            <span class="evidence-item__t">{{ scene.locationName || scene.title }}</span>
            <span class="evidence-item__d">{{ formatDate(scene.eventDate) }}</span>
          </span>
          <Icon name="chevron-right" :size="15" style="color: var(--faint)" />
        </button>
        <p v-if="evidence.length === 0" class="hint">근거 장면이 모두 삭제되었어요. 글은 그대로 남아 있습니다.</p>
      </div>

      <div class="reader__actions">
        <button class="btn btn--ghost" @click="pickingTone = !pickingTone">
          <Icon name="refresh" :size="16" /> 다른 톤으로 다시 쓰기
        </button>
        <button class="btn btn--quiet" @click="beginEdit">
          <Icon name="pencil" :size="15" /> 문장 고치기
        </button>
      </div>

      <div v-if="pickingTone" class="card card--paper" style="margin-top: 10px">
        <p class="label" style="margin-bottom: 8px">어떤 목소리로 다시 쓸까요?</p>
        <div class="chip-row">
          <button
            v-for="item in TONES"
            :key="item.key"
            class="chip"
            :class="{ 'chip--active': chapter.toneKey === item.key }"
            :disabled="ui.generating"
            @click="rewrite(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
        <p class="hint" style="margin-top: 8px">
          이전 버전은 저장소에 남습니다. 이 기간의 장면 {{ evidence.length }}개로 다시 씁니다.
          {{ state.settings.useAI && state.settings.geminiKey ? '' : '(현재는 로컬 문장 조합)' }}
        </p>
      </div>

      <p class="hint" style="margin-top: 18px; text-align: center">
        문단을 누르면 그 근거 장면을 열어 한 줄을 고칠 수 있어요.
      </p>
    </footer>
  </div>

  <div v-else class="page page--no-tabs">
    <header class="topbar">
      <router-link to="/book" class="icon-btn" aria-label="뒤로">
        <Icon name="chevron-left" :size="18" />
      </router-link>
    </header>
    <div class="empty" style="margin-top: 20px">
      <h3>이 글을 찾을 수 없어요</h3>
      <p>삭제되었거나 다른 기기에서 만들어진 챕터입니다.</p>
      <router-link to="/book" class="btn btn--ghost" style="margin-top: 14px">책 목록으로</router-link>
    </div>
  </div>
</template>
