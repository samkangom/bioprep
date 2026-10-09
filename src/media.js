import { MAX_VIDEO_BYTES } from '../shared/rules.js'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const mb = (b) => `${Math.round(b / 1024 / 1024)} MB`

const readHead = (file, n = 16) => file.slice(0, n).arrayBuffer().then((b) => new Uint8Array(b))
const ascii = (u8, from, to) => String.fromCharCode(...u8.slice(from, to))

/** Returns an error sentence, or '' when the file is acceptable. Checks size, type and the MP4 "ftyp" signature. */
export async function validateVideo(file) {
  if (!file) return 'Choose a file first.'
  if (!/\.mp4$/i.test(file.name) && file.type !== 'video/mp4') return 'Only MP4 videos are accepted.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_VIDEO_BYTES) return `That video is ${mb(file.size)}. The limit is ${mb(MAX_VIDEO_BYTES)}. Compress it and try again.`
  try {
    if (ascii(await readHead(file), 4, 8) !== 'ftyp') return 'That file does not look like a real MP4 video.'
  } catch { /* if the head cannot be read the server still checks the type and size */ }
  return ''
}

export async function validateImage(file) {
  if (!file) return 'Choose a file first.'
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Use a PNG, JPEG or WebP image.'
  if (file.size > MAX_IMAGE_BYTES) return `That image is ${mb(file.size)}. The limit is ${mb(MAX_IMAGE_BYTES)}.`
  return ''
}

/** Upload with progress. fetch() cannot report upload progress, so this uses XHR. */
export function xhrUpload({ url, body, headers, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let msg = ''
      try { msg = JSON.parse(xhr.responseText).message || '' } catch { /* not json */ }
      reject(Object.assign(new Error(msg || `Upload failed (${xhr.status})`), { status: xhr.status }))
    }
    xhr.onerror = () => reject(Object.assign(new Error('network'), { code: 'network' }))
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(body)
  })
}
