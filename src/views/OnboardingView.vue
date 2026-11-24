<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import { TONES } from '../data/tones'
import type { ToneKey } from '../types'
import { completeOnboarding } from '../store'

const router = useRouter()
const step = ref(0)
const toneKey = ref<ToneKey>('essay')
const interviewTime = ref('21:30')
const withDemo = ref(true)

const selected = computed(() => TONES.find((t) => t.key === toneKey.value) ?? TONES[1])

function next() {
  if (step.value < 2) {
    step.value += 1
    return
  }
  completeOnboarding({ toneKey: toneKey.value, interviewTime: interviewTime.value, withDemo: withDemo.value })
  router.replace('/')
}

function back() {
  if (step.value > 0) step.value -= 1
}
</script>

<template>
  <div class="onboarding">
    <div class="onboarding__top">
      <div class="topbar__brand">
        <Icon name="book" class="topbar__mark" :size="24" :stroke="1.5" />
        <span class="topbar__title" style="font-size: 18px">타임라인</span>
      </div>
      <div class="dots" aria-label="진행 단계">
        <span v-for="i in 3" :key="i" :class="{ on: step === i - 1 }" />
      </div>
    </div>

    <div class="onboarding__body">
      <!-- 1단계: 소개 -->
      <template v-if="step === 0">
        <p class="eyebrow">매일 쓰지 않아도 쌓이는 자서전</p>
        <h1 class="intro-title" style="margin-top: 12px">
          사진 한 장과<br />
          <em>한 줄의 답</em>으로<br />
          쓰이는 내 이야기
        </h1>
        <p class="intro-sub">
          일기를 쓰지 않아도 괜찮아요. 사진이 날짜와 장소를 기억하고, 밤에 딱 한 줄만 물어봅니다. 그 조각들이
          모이면 한 권의 자서전이 됩니다.
        </p>

        <div class="intro-points">
          <div class="intro-point">
            <span class="intro-point__num">1</span>
            <span><b>사진을 올리면 장면이 생깁니다.</b><br />촬영 시각과 GPS로 날짜·장소를 채워 날짜별 카드로 정리해요.</span>
          </div>
          <div class="intro-point">
            <span class="intro-point__num">2</span>
            <span><b>밤에 한 줄만 물어봅니다.</b><br />“그날 무슨 일이 있었나요?” 기분과 사람은 원탭으로.</span>
          </div>
          <div class="intro-point">
            <span class="intro-point__num">3</span>
            <span><b>고른 톤으로 한 편이 됩니다.</b><br />친구에게 말하듯, 담담한 에세이, 전기 작가, 편지.</span>
          </div>
        </div>

        <div class="sample-scene">
          <p class="sample-scene__date">2026년 11월 18일 수요일 · 신림동의 작은 카페</p>
          <p class="sample-scene__text">
            “오래 미뤄 둔 일 하나를 끝냈다. 노트북은 켜 뒀지만 반은 딴짓.”
          </p>
          <p class="tiny muted" style="margin-top: 10px">이 한 줄이 이렇게 한 문단이 됩니다 ↓</p>
          <p class="sample-scene__text" style="margin-top: 6px; font-size: 14px; color: var(--ink-soft)">
            {{ selected.sample }}
          </p>
        </div>
      </template>

      <!-- 2단계: 톤 선택 -->
      <template v-else-if="step === 1">
        <p class="eyebrow">자서전 톤</p>
        <h1 class="intro-title" style="font-size: clamp(26px, 7vw, 32px); margin-top: 10px">
          어떤 목소리로<br />쓰여야 할까요?
        </h1>
        <p class="intro-sub" style="margin-top: 10px">
          같은 장면도 톤에 따라 전혀 다른 글이 됩니다. 나중에 언제든 바꿀 수 있어요.
        </p>

        <div class="tone-list" role="radiogroup" aria-label="자서전 톤 선택">
          <button
            v-for="tone in TONES"
            :key="tone.key"
            class="tone-card"
            :class="{ 'is-selected': toneKey === tone.key }"
            role="radio"
            :aria-checked="toneKey === tone.key"
            @click="toneKey = tone.key"
          >
            <div class="tone-card__head">
              <div>
                <p class="tone-card__label">{{ tone.label }}</p>
                <p class="tone-card__tag">{{ tone.tagline }}</p>
              </div>
              <span class="tone-check"><Icon name="check" :size="12" :stroke="2.6" /></span>
            </div>
            <p class="tone-card__sample">{{ tone.sample }}</p>
          </button>
        </div>
      </template>

      <!-- 3단계: 질문 시간 · 시작 -->
      <template v-else>
        <p class="eyebrow">마지막 한 가지</p>
        <h1 class="intro-title" style="font-size: clamp(26px, 7vw, 32px); margin-top: 10px">
          하루의 질문은<br />몇 시가 좋을까요?
        </h1>
        <p class="intro-sub" style="margin-top: 10px">
          정해 둔 시간에 오늘의 장면 하나를 골라 한 줄을 여쭤봅니다. 알림을 켜지 않아도 앱을 열면 카드로
          기다리고 있어요.
        </p>

        <div class="card" style="margin-top: 20px">
          <div class="row-between">
            <div>
              <p style="font-weight: 600; font-size: 15px">밤 인터뷰 시간</p>
              <p class="tiny muted">기본 21:30 · 나중에 설정에서 바꿀 수 있어요</p>
            </div>
            <input v-model="interviewTime" type="time" class="input" style="width: 128px; font-size: 15px" />
          </div>
        </div>

        <div class="card" style="margin-top: 10px">
          <button class="row-between" style="width: 100%" @click="withDemo = !withDemo">
            <div style="text-align: left">
              <p style="font-weight: 600; font-size: 15px">샘플 기록으로 시작하기</p>
              <p class="tiny muted">지난 3주의 장면 12개와 글 2편을 채워 둡니다. 언제든 지울 수 있어요.</p>
            </div>
            <span class="switch" :class="{ on: withDemo }" role="switch" :aria-checked="withDemo" />
          </button>
        </div>

        <div class="card card--paper" style="margin-top: 10px">
          <div class="row" style="align-items: flex-start; gap: 10px">
            <Icon name="shield" :size="18" style="color: var(--green); flex: none; margin-top: 2px" />
            <p class="tiny" style="color: var(--ink-soft); line-height: 1.6">
              사진은 이 브라우저를 떠나지 않습니다. 원본 대신 작은 썸네일만 기기에 저장되고, 글은 고른 톤의
              문장 조합기로 바로 만들어집니다. 원하면 설정에서 Gemini 키를 넣어 AI 문장으로 바꿀 수 있어요.
            </p>
          </div>
        </div>

        <p class="hint" style="margin-top: 16px; text-align: center">
          고른 톤 · <b>{{ selected.label }}</b> · {{ interviewTime }}에 한 줄 질문
        </p>
      </template>
    </div>

    <div class="onboarding__foot">
      <button class="btn btn--primary btn--block" style="height: 50px" @click="next">
        {{ step === 0 ? '시작하기' : step === 1 ? '이 톤으로 시작하기' : '자서전 시작하기' }}
        <Icon name="arrow-right" :size="18" />
      </button>
      <button v-if="step > 0" class="btn btn--quiet btn--block" style="margin-top: 4px" @click="back">
        이전으로
      </button>
    </div>
  </div>
</template>
