import { parse } from 'exifr'
import type { PhotoMeta } from '../types'
import { uid } from './id'

/** 사진에서 읽어 보는 EXIF 필드만 고른다 (속도·프라이버시). */
const EXIF_PICK = [
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'GPSLatitude',
  'GPSLongitude',
  'GPSLatitudeRef',
  'GPSLongitudeRef',
  'Make',
  'Model',
] as const

interface ExifLike {
  DateTimeOriginal?: Date | string
  CreateDate?: Date | string
  ModifyDate?: Date | string
  latitude?: number
  longitude?: number
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

/** 브라우저에서 원본 없이 축소 썸네일만 만든다. HEIC 등 디코딩 불가 형식은 자리표시자를 쓴다. */
async function makeThumb(file: File, max = 560): Promise<{ thumb: string; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    return { thumb: canvas.toDataURL('image/jpeg', 0.72), width, height }
  } catch {
    return { thumb: placeholderThumb(file.name), width: 0, height: 0 }
  }
}

const PALETTES = [
  ['#c9b79c', '#7e8f7a'],
  ['#b7a7a0', '#6a7b8c'],
  ['#d3b98f', '#9a6b52'],
  ['#b3bab0', '#5d6b62'],
  ['#cbb6a4', '#8b6f6a'],
]

export function placeholderThumb(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973
  const [a, b] = PALETTES[h % PALETTES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="240" fill="url(#g)"/><circle cx="242" cy="62" r="26" fill="#fff" fill-opacity="0.45"/><path d="M0 190 Q80 130 160 176 T320 160 V240 H0 Z" fill="#31281f" fill-opacity="0.28"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export async function readPhoto(file: File): Promise<PhotoMeta> {
  let exif: ExifLike | undefined
  try {
    exif = (await parse(file, { pick: [...EXIF_PICK], gps: true })) as ExifLike | undefined
  } catch {
    exif = undefined
  }
  const takenAt =
    toIso(exif?.DateTimeOriginal) ?? toIso(exif?.CreateDate) ?? toIso(exif?.ModifyDate) ?? toIso(new Date(file.lastModified))
  const lat = typeof exif?.latitude === 'number' ? exif.latitude : undefined
  const lng = typeof exif?.longitude === 'number' ? exif.longitude : undefined
  const { thumb, width, height } = await makeThumb(file)
  return {
    id: uid(),
    name: file.name,
    thumb,
    takenAt,
    lat,
    lng,
    width,
    height,
  }
}

export async function readPhotos(files: File[]): Promise<PhotoMeta[]> {
  const photos: PhotoMeta[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    photos.push(await readPhoto(file))
  }
  return photos
}
