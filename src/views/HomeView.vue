<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../components/Icon.vue'
import SceneCard from '../components/SceneCard.vue'
import BookCard from '../components/BookCard.vue'
import { activeTone } from '../lib/toneView'
import { formatDate, toKey, weekRangeOf } from '../lib/date'
import { hasSample, latestChapters, loadDemo, pendingScenes, scenesSorted, state, clearSample, ui } from '../store'
import type { Scene } from '../types'

const today = new Date()
const dateLabel = formatDate(toKey(today))

const chapters = computed(() => latestChapters())
const latestChapter = computed(() => chapters.value[0])
const pending = computed(() => pendingScenes.value)
const totalPhotos = computed(() => state.scenes.reduce((n, s) => n + s.photos.length, 0))

const week = weekRangeOf(today)
const weekCount = computed(
  () => state.scenes.filter((s) => s.eventDate >= week.start && s.eventDate <= week.end).length,
)

const progress = computed(() => Math.min(100, Math.round((state.scenes.length / 30) * 100)))
const remaining = computed(() => Math.max(0, 30 - state.scenes.length))

const groups = computed(() => {
  const map = new Map<string, Scene[]>()
  for (const scene of scenesSorted.value) {
    const list = map.get(scene.eventDate) ?? []
    list.push(scene)
    map.set(scene.eventDate, list)
  }
  return [...map.entries()].map(([date, scenes]) => ({ date, scenes }))
})

const oneYearAgo = computed(() => {
  const now = new Date()
  const m = now.getMonth() + 1
  const d = now.getDate()
  return scenesSorted.value.find((s) => {
    const date = new Date(s.startedAt)
    return date.getMonth() + 1 === m && date.getDate() === d && date.getFullYear() < now.getFullYear()
  })
})

const dayLabel = (key: string) => {
  if (key === toKey(today)) return '오늘'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === toKey(yesterday)) return '어제'
  return ''
}

function openScene(id: string) {
  ui.sceneSheetId = id
}

function startSample() {
  loadDemo(activeTone().key)
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="topbar__brand">
        <Icon name="book" class="topbar__mark" :size="26" :stroke="1.5" />
        <div>
          <p class="topbar__title">타임라인</p>
          <p class="topbar__sub">{{ dateLabel }}</p>
        </div>
      </div>
      <router-link to="/settings" class="icon-btn" aria-label="설정">
        <Icon name="gear" :size="19" />
      </router-link>
    </header>

    <section class="hero">
      <p class="hero__eyebrow">나의 자서전</p>
      <template v-if="state.scenes.length">
        <h1 class="hero__title">
          지금까지 <em>{{ state.scenes.length }}개</em>의 장면이<br />
          한 권으로 엮이고 있어요
        </h1>
        <p class="hero__meta">
          이번 주 {{ weekCount }}장면 · {{ chapters.length }}장 집필 · {{ state.persons.length }}명의 사람
        </p>

        <div class="stat-row">
          <div class="stat">
            <b>{{ state.scenes.length }}</b>
            <span>장면</span>
          </div>
          <div class="stat">
            <b>{{ totalPhotos }}</b>
            <span>사진</span>
          </div>
          <div class="stat">
            <b>{{ state.persons.length }}</b>
            <span>사람</span>
          </div>
        </div>

        <div class="progress"><span :style="{ width: `${progress}%` }" /></div>
        <div class="hero__foot">
          <span>{{ remaining > 0 ? `${remaining}장면 더 모이면 첫 책` : '첫 책을 만들 수 있어요' }}</span>
          <span>{{ progress }}%</span>
        </div>
      </template>
      <template v-else>
        <h1 class="hero__title">
          아직 비어 있는<br />
          <em>첫 페이지</em>예요
        </h1>
        <p class="hero__meta">
          사진 한 장과 한 줄이면 시작할 수 있어요.<br />
          아래에서 첫 장면을 만들어 보세요.
        </p>
      </template>
    </section>

    <div class="stack" style="margin-top: 14px">
      <button v-if="pending.length" class="cta" type="button" @click="openScene(pending[0].id)">
        <span class="cta__icon"><Icon name="moon" :size="21" /></span>
        <span class="grow">
          <span class="cta__title">{{ pending.length }}개의 장면이 한 줄을 기다려요</span>
          <span class="cta__sub">{{ activeTone().interview(pending[0].locationName) }}</span>
        </span>
        <Icon name="chevron-right" :size="18" class="cta__arrow" />
      </button>

      <router-link
        v-else-if="state.scenes.length"
        to="/add"
        class="cta"
        style="background: linear-gradient(140deg, #6d4a33, #9a4a2f)"
      >
        <span class="cta__icon"><Icon name="camera" :size="21" /></span>
        <span class="grow">
          <span class="cta__title">오늘의 사진으로 장면 남기기</span>
          <span class="cta__sub">촬영 시각과 장소를 사진에서 읽어 옵니다</span>
        </span>
        <Icon name="chevron-right" :size="18" class="cta__arrow" />
      </router-link>
    </div>

    <template v-if="state.scenes.length">
      <div class="section-head">
        <h2>최근 기록</h2>
        <router-link to="/add" class="more">+ 장면 추가</router-link>
      </div>

      <section class="day-group" v-for="group in groups.slice(0, 6)" :key="group.date" style="margin-top: 14px">
        <div class="day-head">
          <b>
            <span v-if="dayLabel(group.date)" class="today-dot" />
            {{ dayLabel(group.date) || formatDate(group.date) }}
          </b>
          <span>{{ group.scenes.length }}장면</span>
        </div>
        <div class="stack-sm">
          <SceneCard v-for="scene in group.scenes" :key="scene.id" :scene="scene" @open="openScene" />
        </div>
      </section>

      <template v-if="latestChapter">
        <div class="section-head">
          <h2>최근에 엮은 글</h2>
          <router-link to="/book" class="more">책 전체 →</router-link>
        </div>
        <BookCard :chapter="latestChapter" />
      </template>

      <template v-if="oneYearAgo">
        <div class="section-head">
          <h2>1년 전 오늘</h2>
          <span class="more">같은 날의 기록</span>
        </div>
        <SceneCard :scene="oneYearAgo" show-date @open="openScene" />
      </template>

      <p v-if="hasSample()" class="hint" style="margin-top: 26px; text-align: center">
        둘러보기용 샘플 기록이 섞여 있어요.
        <button class="btn btn--quiet btn--sm" style="height: 24px; padding: 0 6px" @click="clearSample()">
          샘플 지우기
        </button>
      </p>
    </template>

    <template v-else>
      <div class="section-head">
        <h2>첫 장면을 만들어 볼까요</h2>
      </div>
      <div class="empty">
        <svg class="empty__art" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="14" y="16" width="66" height="60" rx="5" />
          <path d="M28 34h38M28 46h28M28 58h20" stroke-linecap="round" />
          <circle cx="88" cy="58" r="17" />
          <path d="M82 58h12M88 52v12" stroke-linecap="round" />
        </svg>
        <h3>아직 쌓인 장면이 없어요</h3>
        <p>사진을 올리면 촬영 시각과 장소를 읽어 장면을 만들고,<br />한 줄 답변이 더해져 한 편의 글이 됩니다.</p>
        <div class="empty__actions">
          <router-link to="/add" class="btn btn--primary btn--block">
            <Icon name="camera" :size="18" /> 사진으로 첫 장면 만들기
          </router-link>
          <button class="btn btn--ghost btn--block" @click="startSample">
            <Icon name="sparkles" :size="17" /> 샘플 기록으로 먼저 둘러보기
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
