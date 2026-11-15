interface SpeechRecognitionResultItem {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionResultItem
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export interface SpeechSupport {
  recognition: boolean
  synthesis: boolean
}

export interface SpeechRecognizer {
  start(): void
  stop(): void
  abort(): void
}

export function getSpeechSupport(): SpeechSupport {
  if (typeof window === 'undefined') return { recognition: false, synthesis: false }
  return {
    recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    synthesis: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  }
}

const RECOGNITION_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': '未获得麦克风权限，请在浏览器设置中允许后重试',
  'service-not-allowed': '浏览器已禁用语音识别服务',
  'audio-capture': '未检测到可用麦克风',
  'no-speech': '没有听到清晰语音，请靠近麦克风重试',
  network: '语音识别网络服务暂时不可用',
  aborted: '语音输入已停止'
}

export function createSpeechRecognizer(options: {
  onResult: (transcript: string, isFinal: boolean) => void
  onError: (message: string, code: string) => void
  onEnd: () => void
}): SpeechRecognizer | null {
  if (typeof window === 'undefined') return null
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) return null

  const recognition = new Recognition()
  recognition.lang = 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.onresult = event => {
    let transcript = ''
    let isFinal = false
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      transcript += result?.[0]?.transcript || ''
      isFinal = isFinal || Boolean(result?.isFinal)
    }
    if (transcript.trim()) options.onResult(transcript.trim(), isFinal)
  }
  recognition.onerror = event => {
    const code = event.error || 'unknown'
    options.onError(RECOGNITION_ERROR_MESSAGES[code] || '语音识别暂时不可用，请改用文字输入', code)
  }
  recognition.onend = options.onEnd

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort()
  }
}

export function toSpeechText(markdown: string): string {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*#>_~|]/g, '')
    .replace(/^\s*[-+•·]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function speakText(
  text: string,
  options: { onStart?: () => void; onEnd?: () => void; onError?: () => void } = {}
): boolean {
  if (!getSpeechSupport().synthesis) return false
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(toSpeechText(text))
  utterance.lang = 'zh-CN'
  utterance.rate = 1
  utterance.pitch = 1
  utterance.onstart = () => options.onStart?.()
  utterance.onend = () => options.onEnd?.()
  utterance.onerror = () => options.onError?.()
  window.speechSynthesis.speak(utterance)
  return true
}

export function pauseSpeech(): void {
  if (getSpeechSupport().synthesis) window.speechSynthesis.pause()
}

export function resumeSpeech(): void {
  if (getSpeechSupport().synthesis) window.speechSynthesis.resume()
}

export function stopSpeech(): void {
  if (getSpeechSupport().synthesis) window.speechSynthesis.cancel()
}
