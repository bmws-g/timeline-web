import { toneOf } from '../data/tones'
import { state } from '../store'

/** 지금 선택된 자서전 톤 프리셋 */
export function activeTone() {
  return toneOf(state.toneKey)
}
