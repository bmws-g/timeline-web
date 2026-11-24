<script setup lang="ts">
import { computed } from 'vue'
import type { Scene } from '../types'
import Icon from './Icon.vue'
import { moodOf } from '../data/tones'
import { formatTime } from '../lib/date'
import { state } from '../store'

const props = defineProps<{ scene: Scene; showDate?: boolean }>()
const emit = defineEmits<{ open: [id: string] }>()

const cover = computed(() => props.scene.photos[0]?.thumb)
const photoCount = computed(() => props.scene.photos.length)
const mood = computed(() => moodOf(props.scene.mood))
const people = computed(() =>
  props.scene.personIds
    .map((id) => state.persons.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p)),
)
const needsAnswer = computed(() => props.scene.interviewState === 'pending')
</script>

<template>
  <button class="scene" type="button" @click="emit('open', scene.id)">
    <div class="scene__thumb" :class="{ 'scene__thumb--empty': !cover }">
      <img v-if="cover" :src="cover" alt="" loading="lazy" />
      <Icon v-else name="image" :size="22" />
      <span v-if="photoCount > 1" class="scene__thumb-count">+{{ photoCount - 1 }}</span>
    </div>

    <div class="scene__body">
      <div class="scene__top">
        <span class="scene__time">{{ formatTime(scene.startedAt) }}</span>
        <span v-if="showDate" class="muted tiny">{{ scene.eventDate.slice(5).replace('-', '.') }}</span>
        <span v-if="mood" class="badge" :style="{ color: mood.tone, borderColor: 'transparent', background: mood.tone + '14' }">
          {{ mood.emoji }} {{ mood.label }}
        </span>
        <span v-if="needsAnswer" class="badge badge--accent">1줄 답변</span>
      </div>

      <p class="scene__title">{{ scene.locationName || scene.title }}</p>

      <p v-if="scene.userNote" class="scene__note">“{{ scene.userNote }}”</p>
      <p v-else class="scene__note scene__note--muted">{{ scene.autoSummary }}</p>

      <div v-if="people.length" class="scene__chips">
        <span v-for="person in people" :key="person.id" class="chip chip--person chip--sm">{{ person.displayName }}</span>
      </div>
    </div>
  </button>
</template>
