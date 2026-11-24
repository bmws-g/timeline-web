<script setup lang="ts">
import { computed } from 'vue'
import type { Chapter } from '../types'
import { toneOf } from '../data/tones'
import { periodLabel } from '../lib/date'
import { state } from '../store'

const props = defineProps<{ chapter: Chapter }>()

const cover = computed(() => {
  const scene = state.scenes.find((s) => s.id === props.chapter.coverSceneId)
  return scene?.photos[0]?.thumb
})
const tone = computed(() => toneOf(props.chapter.toneKey))
const period = computed(() => periodLabel(props.chapter.periodStart, props.chapter.periodEnd))
const kindLabel = computed(() => (props.chapter.kind === 'week' ? '주간 단편' : '월간 기록'))
</script>

<template>
  <router-link :to="`/book/${chapter.id}`" class="book-card">
    <div class="book-card__cover">
      <img v-if="cover" :src="cover" alt="" loading="lazy" />
    </div>
    <div class="book-card__body">
      <p class="book-card__period">{{ kindLabel }} · {{ period }}</p>
      <h3 class="book-card__title">{{ chapter.title }}</h3>
      <p class="book-card__summary">{{ chapter.summary }}</p>
      <div class="book-card__foot">
        <span class="badge">{{ tone.label }}</span>
        <span v-if="chapter.generatedBy === 'gemini'" class="badge badge--accent">AI</span>
        <span v-if="chapter.version > 1" class="badge">v{{ chapter.version }}</span>
        <span v-if="chapter.status === 'edited'" class="badge badge--green">직접 다듬음</span>
      </div>
    </div>
  </router-link>
</template>
