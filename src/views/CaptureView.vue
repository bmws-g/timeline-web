<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import type { PhotoMeta, SceneDraft } from '../types'
import { readPhotos } from '../lib/photos'
import { groupDraftsByDate } from '../lib/scene'
import { isoAt, toKey, formatDate } from '../lib/date'
import { addScenes, toast } from '../store'

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const photos = ref<PhotoMeta[]>([])
const drafts = ref<SceneDraft[]>([])
const manualDrafts = ref<SceneDraft[]>([])
const parsing = ref(false)
const dragging = ref(false)
const locating = ref<string | null>(null)

const allDrafts = computed(() => [...drafts.value, ...manualDrafts.value])
const totalPhotos = computed(() => photos.value.length)

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  void handleFiles(target.files)
}

function openPicker() {
  fileInput.value?.click()
}

async function handleFiles(list: FileList | File[] | null) {
  if (!list) return
  const files = [...list].filter((f) => f.type.startsWith('image/'))
  if (files.length === 0) {
    toast('이미지 파일만 올릴 수 있어요.', 'error')
    return
  }
  parsing.value = true
  try {
    const read = await readPhotos(files)
    photos.value = [...photos.value, ...read]
    rebuildDrafts()
    const withExif = read.filter((p) => p.takenAt).length
    toast(`${read.length}장을 읽었어요${withExif ? ` · ${withExif}장에서 촬영 시각을 찾았습니다` : ''}.`, 'success')
  } catch {
    toast('사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.', 'error')
  } finally {
    parsing.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function rebuildDrafts() {
  const previous = new Map(drafts.value.map((d) => [d.eventDate, d]))
  drafts.value = groupDraftsByDate(photos.value).map((draft) => {
    const old = previous.get(draft.eventDate)
    if (!old) return draft
    return {
      ...draft,
      locationName: old.locationName,
      note: old.note,
      lat: draft.lat ?? old.lat,
      lng: draft.lng ?? old.lng,
    }
  })
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = event.dataTransfer?.files
  if (files) void handleFiles(files)
}

function removePhoto(photoId: string) {
  photos.value = photos.value.filter((p) => p.id !== photoId)
  if (photos.value.length === 0) {
    drafts.value = []
  } else {
    rebuildDrafts()
  }
}

function removeDraft(key: string) {
  const target = drafts.value.find((d) => d.key === key)
  if (target) {
    const keep = new Set(target.photos.map((p) => p.id))
    photos.value = photos.value.filter((p) => !keep.has(p.id))
    if (photos.value.length === 0) drafts.value = []
    else rebuildDrafts()
    return
  }
  manualDrafts.value = manualDrafts.value.filter((d) => d.key !== key)
}

function addManual() {
  const now = new Date()
  const date = toKey(now)
  manualDrafts.value.push({
    key: `manual-${Date.now()}`,
    eventDate: date,
    startedAt: isoAt(date, now.getHours(), now.getMinutes()),
    locationName: '',
    photos: [],
    note: '',
  })
}

function photoTimeLabel(draft: SceneDraft): string {
  const withTime = draft.photos.filter((p) => p.takenAt).length
  if (draft.photos.length === 0) return '사진 없이 직접 쓰는 장면'
  if (withTime === draft.photos.length) return '사진에서 촬영 시각을 읽었어요'
  if (withTime === 0) return '촬영 시각이 없어요 · 날짜를 골라 주세요'
  return `${withTime}장에서만 촬영 시각을 찾았어요`
}

async function lookupPlace(draft: SceneDraft) {
  if (typeof draft.lat !== 'number' || typeof draft.lng !== 'number') return
  locating.value = draft.key
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${draft.lat}&lon=${draft.lng}&zoom=16&accept-language=ko`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error('failed')
    const data = (await res.json()) as {
      name?: string
      display_name?: string
      address?: Record<string, string>
    }
    const addr = data.address ?? {}
    const name =
      data.name ||
      addr.amenity ||
      addr.road ||
      addr.neighbourhood ||
      addr.suburb ||
      addr.city_district ||
      data.display_name?.split(',')[0]
    if (name) {
      draft.locationName = name
      toast(`장소를 찾았어요: ${name}`, 'success')
    } else {
      toast('장소명을 찾지 못했어요. 직접 입력해 주세요.', 'info')
    }
  } catch {
    toast('장소명을 찾지 못했어요. 직접 입력해 주세요.', 'error')
  } finally {
    locating.value = null
  }
}

function saveAll() {
  const usable = allDrafts.value.filter(
    (d) => d.photos.length > 0 || d.locationName.trim() || d.note.trim(),
  )
  if (usable.length === 0) {
    toast('먼저 사진을 올리거나 장소를 적어 주세요.', 'error')
    return
  }
  const created = addScenes(usable)
  photos.value = []
  drafts.value = []
  manualDrafts.value = []
  toast(`장면 ${created.length}개를 만들었어요. 이제 한 줄만 남겨 볼까요?`, 'success')
  router.push('/')
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div>
        <p class="eyebrow">새 장면</p>
        <h1 style="font-size: 24px; margin-top: 2px">사진으로 기록하기</h1>
      </div>
      <router-link to="/" class="icon-btn" aria-label="닫기">
        <Icon name="close" :size="18" />
      </router-link>
    </header>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="sr-only"
      @change="onFileChange"
    />

    <div
      class="dropzone"
      :class="{ 'is-drag': dragging }"
      role="button"
      tabindex="0"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="dropzone__icon"><Icon name="camera" :size="22" /></span>
      <b>{{ parsing ? '사진을 읽는 중…' : '사진을 여기에 끌어다 놓거나 눌러서 고르기' }}</b>
      <span>여러 장을 한 번에 올려도 됩니다 · 촬영 일시와 GPS를 사진에서 직접 읽어요</span>
    </div>

    <p class="hint" style="margin-top: 8px; text-align: center">
      <Icon name="shield" :size="11" style="vertical-align: -1px" />
      원본 사진은 서버로 보내지 않아요. 이 브라우저에 작은 썸네일만 저장됩니다.
    </p>

    <template v-if="totalPhotos">
      <div class="section-head">
        <h2>올린 사진 {{ totalPhotos }}장</h2>
        <button class="btn btn--quiet btn--sm" @click="photos = []; drafts = []">모두 지우기</button>
      </div>
      <div class="upload-grid">
        <figure v-for="photo in photos" :key="photo.id">
          <img :src="photo.thumb" :alt="photo.name" />
          <button type="button" aria-label="사진 빼기" @click="removePhoto(photo.id)">
            <Icon name="close" :size="12" />
          </button>
        </figure>
      </div>
    </template>

    <div class="section-head">
      <h2>만들어질 장면 {{ allDrafts.length ? `(${allDrafts.length})` : '' }}</h2>
      <button class="btn btn--quiet btn--sm" @click="addManual">+ 사진 없이 추가</button>
    </div>

    <div v-if="allDrafts.length" class="stack">
      <article v-for="draft in allDrafts" :key="draft.key" class="draft-card">
        <div class="draft-card__head">
          <div>
            <p class="draft-card__date">{{ formatDate(draft.eventDate) }}</p>
            <p class="tiny muted" style="margin-top: 2px">{{ photoTimeLabel(draft) }}</p>
            <div class="chip-row" style="margin-top: 6px">
              <span v-if="draft.lat" class="badge badge--green badge--dot">GPS 있음</span>
              <span v-else class="badge">위치 정보 없음</span>
              <span v-if="draft.photos.length" class="badge">{{ draft.photos.length }}장</span>
            </div>
          </div>
          <button class="icon-btn icon-btn--plain" aria-label="이 장면 빼기" @click="removeDraft(draft.key)">
            <Icon name="close" :size="16" />
          </button>
        </div>

        <div v-if="draft.photos.length" class="draft-card__photos">
          <img v-for="photo in draft.photos" :key="photo.id" :src="photo.thumb" :alt="photo.name" />
        </div>

        <div class="grid-2">
          <label class="field">
            <span class="label">날짜</span>
            <input v-model="draft.eventDate" type="date" class="input" />
          </label>
          <label class="field">
            <span class="label">장소</span>
            <input v-model="draft.locationName" class="input" placeholder="예: 신림동 카페" />
          </label>
        </div>

        <label class="field" style="margin-top: 10px">
          <span class="label">한 줄 메모 (선택)</span>
          <input v-model="draft.note" class="input" placeholder="지금 적어 두어도 좋아요. 나중에 고칠 수 있습니다." />
        </label>

        <button
          v-if="draft.lat && draft.lng"
          class="btn btn--quiet btn--sm"
          style="margin-top: 6px; padding-left: 0; color: var(--accent)"
          :disabled="locating === draft.key"
          @click="lookupPlace(draft)"
        >
          <Icon name="map-pin" :size="14" />
          {{ locating === draft.key ? '찾는 중…' : '좌표로 장소명 찾기 (OpenStreetMap 전송)' }}
        </button>
      </article>
    </div>

    <div v-else class="empty" style="margin-top: 4px">
      <svg class="empty__art" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="1.4">
        <rect x="16" y="22" width="88" height="56" rx="7" />
        <circle cx="60" cy="50" r="15" />
        <path d="M42 22l5-8h26l5 8" stroke-linejoin="round" />
      </svg>
      <h3>아직 고른 사진이 없어요</h3>
      <p>사진을 올리면 촬영한 날짜별로 장면 초안을 만들어 드려요.<br />사진이 없어도 직접 장면을 추가할 수 있습니다.</p>
    </div>

    <div v-if="allDrafts.length" style="margin-top: 20px" class="stack">
      <button class="btn btn--primary btn--block" style="height: 50px" @click="saveAll">
        <Icon name="check" :size="18" /> 장면 {{ allDrafts.length }}개 만들기
      </button>
      <p class="hint" style="text-align: center">
        만든 뒤 각 장면에 “그날 무슨 일이 있었나요?” 한 줄과 기분·사람을 더할 수 있어요.
      </p>
    </div>
  </div>
</template>
