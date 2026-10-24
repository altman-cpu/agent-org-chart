export interface SpeechResult {
  ok: boolean
  voiceName: string
  message: string
}

// Uses one available English system voice per browser; no third-party audio API is called.
export function speakWithDeviceVoice(text: string): SpeechResult {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    return { ok: false, voiceName: '', message: 'Read-aloud is not supported by this browser.' }
  }

  try {
    const synthesis = window.speechSynthesis
    const voices = synthesis.getVoices()
    const voice = voices.find(item => item.lang.toLowerCase() === 'en-us')
      ?? voices.find(item => item.lang.toLowerCase().startsWith('en'))
      ?? null
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = voice?.lang ?? 'en-US'
    if (voice) utterance.voice = voice
    utterance.rate = 1
    utterance.pitch = 1
    synthesis.cancel()
    synthesis.speak(utterance)

    return {
      ok: true,
      voiceName: voice?.name ?? 'device default English voice',
      message: 'Read-aloud uses the browser/device voice; no audio is sent to a speech provider.',
    }
  } catch {
    return { ok: false, voiceName: '', message: 'The browser could not start read-aloud.' }
  }
}

export function stopDeviceVoice() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}
