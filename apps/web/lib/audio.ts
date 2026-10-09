/**
 * Voice recording helpers for the browser. Recordings are converted to
 * 16 kHz mono 16-bit WAV before upload: every AI provider accepts it, and
 * two minutes stay below 4 MB.
 */

export const TRANSCRIBE_SAMPLE_RATE = 16_000;
/** Longest recording, in seconds. */
export const MAX_RECORDING_SECONDS = 120;

/** Recorder formats in order of preference (Safari records MP4 only). */
const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** The best supported MediaRecorder type, or '' to let the browser choose. */
export function recorderMimeType(isSupported: (type: string) => boolean): string {
  return RECORDER_TYPES.find((type) => isSupported(type)) ?? '';
}

/** 16-bit PCM WAV bytes for mono samples in the range -1 to 1. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return bytes;
}

/** Decodes a recording and resamples it to 16 kHz mono WAV, at most `maxSeconds` long. */
export async function recordingToWav(recording: Blob, maxSeconds = MAX_RECORDING_SECONDS): Promise<Blob> {
  const context = new AudioContext();

  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const seconds = Math.min(decoded.duration, maxSeconds);
    const offline = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(seconds * TRANSCRIBE_SAMPLE_RATE)),
      TRANSCRIBE_SAMPLE_RATE,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const wav = encodeWav(rendered.getChannelData(0), TRANSCRIBE_SAMPLE_RATE);
    return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
  } finally {
    void context.close();
  }
}
