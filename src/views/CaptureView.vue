<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import type { PhotoMeta, SceneDraft } from '../types'
import { readPhotos } from '../lib/photos'
import { coordinateLabel, groupDraftsByDate } from '../lib/scene'
import { reverseGeocode } from '../lib/geocode'
import { isoAt, toKey, formatDate } from '../lib/date'
import { addScenes, toast } from '../store'

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const photos = ref<PhotoMeta[]>([])
const drafts = ref<SceneDraft[]>([])
const manualDrafts = ref<SceneDraft[]>([])
const parsing = ref(false)
const dragging = ref(false)
const saving = ref(false)

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
      // 조회 중이던 초안은 새 객체로 다시 이어 받도록 비워 둔다(같은 좌표는 큐에서 합쳐진다).
      placeLookup: old.placeLookup === 'searching' ? undefined : old.placeLookup,
    }
  })
  autoFillPlaces()
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

/** 사진 좌표로 장소명을 채운다. 이미 적어 둔 이름은 건드리지 않는다. */
async function fillPlace(draft: SceneDraft, opts: { force?: boolean; notify?: boolean } = {}) {
  if (typeof draft.lat !== 'number' || typeof draft.lng !== 'number') return
  if (draft.placeLookup === 'searching') return
  if (!opts.force && draft.locationName.trim()) return
  draft.placeLookup = 'searching'
  try {
    const name = await reverseGeocode(draft.lat, draft.lng)
    if (!drafts.value.includes(draft)) return
    if (name) {
      if (opts.force || !draft.locationName.trim()) draft.locationName = name
      draft.placeLookup = 'found'
      if (opts.notify) toast(`장소를 찾았어요: ${name}`, 'success')
    } else {
      draft.placeLookup = 'empty'
      if (opts.notify) toast('이 좌표에서는 장소명을 찾지 못했어요. 직접 적어 주세요.', 'info')
    }
  } catch {
    if (!drafts.value.includes(draft)) return
    draft.placeLookup = 'failed'
    if (opts.notify) toast('장소명을 찾지 못했어요. 직접 적거나 잠시 뒤 다시 시도해 주세요.', 'error')
  }
}

/** GPS가 찍힌 사진은 올리자마자 장소명을 채워 둔다(초당 1요청 큐로 순차 처리). */
function autoFillPlaces() {
  for (const draft of drafts.value) {
    if (typeof draft.lat !== 'number' || typeof draft.lng !== 'number') continue
    if (draft.placeLookup) continue
    if (draft.locationName.trim()) continue
    void fillPlace(draft)
  }
}

function retryPlace(draft: SceneDraft) {
  draft.placeLookup = undefined
  void fillPlace(draft, { force: true, notify: true })
}

/** 장소명을 찾는 중인 초안을 잠깐(최대 4초) 기다린다. 늦은 초안은 장면 상세에서 이어진다. */
async function waitForPlaceLookups(targets: SceneDraft[], timeoutMs = 4000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (!targets.some((d) => d.placeLookup === 'searching')) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

async function saveAll() {
  if (saving.value) return
  const usable = allDrafts.value.filter(
    (d) => d.photos.length > 0 || d.locationName.trim() || d.note.trim(),
  )
  if (usable.length === 0) {
    toast('먼저 사진을 올리거나 장소를 적어 주세요.', 'error')
    return
  }
  saving.value = true
  try {
    if (usable.some((d) => d.placeLookup === 'searching')) {
      toast('사진 좌표로 장소명을 찾는 중이에요. 잠시만 기다려 주세요.', 'info')
      await waitForPlaceLookups(usable)
    }
    const created = addScenes(usable)
    photos.value = []
    drafts.value = []
    manualDrafts.value = []
    toast(`장면 ${created.length}개를 만들었어요. 이제 한 줄만 남겨 볼까요?`, 'success')
    router.push('/')
  } finally {
    saving.value = false
  }
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
      원본 사진은 서버로 보내지 않아요. 브라우저에 작은 썸네일만 저장되고, 사진에서 읽은 좌표는 장소명을 찾을 때만 OpenStreetMap에 보냅니다.
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

        <div class="field-pair">
          <label class="field">
            <span class="label">날짜</span>
            <input v-model="draft.eventDate" type="date" class="input" />
          </label>
          <label class="field">
            <span class="label">장소</span>
            <input v-model="draft.locationName" class="input" placeholder="예: 신림동 카페" />
          </label>
        </div>

        <div v-if="draft.lat !== undefined && draft.lng !== undefined" class="place-help">
          <p class="hint place-help__text">
            <template v-if="draft.placeLookup === 'searching'">
              <span class="spinner" aria-hidden="true" /> 사진에 찍힌 좌표로 장소명을 찾는 중…
            </template>
            <template v-else-if="draft.placeLookup === 'found'">
              <Icon name="map-pin" :size="11" style="vertical-align: -1px" />
              OpenStreetMap에서 고른 이름 · 좌표 {{ coordinateLabel(draft.lat, draft.lng) }}
            </template>
            <template v-else-if="draft.placeLookup === 'empty'">
              이 좌표에서는 장소명을 찾지 못했어요. 직접 적어 주세요.
            </template>
            <template v-else-if="draft.placeLookup === 'failed'">
              장소명을 찾지 못했어요(네트워크). 직접 적거나 다시 찾아 주세요.
            </template>
            <template v-else>
              사진 좌표 {{ coordinateLabel(draft.lat, draft.lng) }}
            </template>
          </p>
          <button
            v-if="draft.placeLookup !== 'searching'"
            class="btn btn--quiet btn--sm place-help__retry"
            @click="retryPlace(draft)"
          >
            <Icon name="map-pin" :size="14" />
            {{ draft.placeLookup === 'found' ? '장소명 다시 찾기' : '좌표로 장소명 찾기' }}
          </button>
        </div>

        <label class="field" style="margin-top: 12px">
          <span class="label">한 줄 메모 (선택)</span>
          <input v-model="draft.note" class="input" placeholder="지금 적어 두어도 좋아요. 나중에 고칠 수 있습니다." />
        </label>
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
      <button class="btn btn--primary btn--block" style="height: 50px" :disabled="saving" @click="saveAll">
        <Icon name="check" :size="18" /> 장면 {{ allDrafts.length }}개 만들기
      </button>
      <p class="hint" style="text-align: center">
        만든 뒤 각 장면에 “그날 무슨 일이 있었나요?” 한 줄과 기분·사람을 더할 수 있어요.
      </p>
    </div>
  </div>
</template>
