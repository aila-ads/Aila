'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, Square } from 'lucide-react';
import { MAX_RECORDING_SECONDS, recorderMimeType, recordingToWav } from '../../lib/audio';
import { Button } from '../ui/button';

type State = 'idle' | 'starting' | 'recording' | 'transcribing';

const MIC_BLOCKED =
  'Aila can’t use your microphone. Allow microphone access for ailaxx.com in your browser settings and try again.';
const NO_MIC = 'No microphone was found. Connect one and try again.';
const UNSUPPORTED = 'Voice input isn’t supported in this browser. Try the latest Chrome, Edge, Firefox or Safari.';
const FAILED = 'We couldn’t turn that into text. Please try again.';

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    return typeof body.error?.message === 'string' ? body.error.message : FAILED;
  } catch {
    return FAILED;
  }
}

/**
 * Voice input (PRODUCT-SPEC §10.4): records up to two minutes, sends it to
 * Aila for transcription and hands back the text to edit before sending.
 * Nothing is sent automatically and the recording is not kept.
 */
export function VoiceInput({
  disabled,
  onText,
  onError,
}: {
  disabled: boolean;
  onText: (text: string) => void;
  onError: (message: string | null) => void;
}) {
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);
  const request = useRef<AbortController | null>(null);

  function release() {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  useEffect(
    () => () => {
      cancelled.current = true;
      request.current?.abort();
      if (recorder.current?.state === 'recording') {
        recorder.current.stop();
      }
      release();
    },
    [],
  );

  async function transcribe(recording: Blob) {
    setState('transcribing');
    const abort = new AbortController();
    request.current = abort;

    try {
      const wav = await recordingToWav(recording);
      const response = await fetch('/api/intelligence/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: wav,
        signal: abort.signal,
      });

      if (!response.ok) {
        onError(await errorMessage(response));
        return;
      }

      const body = (await response.json()) as { text?: unknown };

      if (typeof body.text === 'string' && body.text.trim()) {
        onText(body.text.trim());
      } else {
        onError(FAILED);
      }
    } catch {
      if (!abort.signal.aborted) {
        onError(FAILED);
      }
    } finally {
      request.current = null;
      if (!cancelled.current) {
        setState('idle');
      }
    }
  }

  async function start() {
    onError(null);

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError(UNSUPPORTED);
      return;
    }

    setState('starting');

    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error) {
      release();
      setState('idle');
      onError(error instanceof DOMException && error.name === 'NotFoundError' ? NO_MIC : MIC_BLOCKED);
      return;
    }

    const mimeType = recorderMimeType((type) => MediaRecorder.isTypeSupported(type));
    const media = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.current = media;

    media.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    media.onstop = () => {
      release();
      recorder.current = null;

      if (!cancelled.current) {
        void transcribe(new Blob(chunks, { type: media.mimeType || mimeType }));
      }
    };

    const startedAt = Date.now();
    setElapsed(0);
    timer.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);

      if (seconds >= MAX_RECORDING_SECONDS && media.state === 'recording') {
        media.stop();
      }
    }, 250);
    media.start(1000);
    setState('recording');
  }

  function stop() {
    if (recorder.current?.state === 'recording') {
      recorder.current.stop();
    }
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2">
        <span role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-destructive">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-destructive" />
          Recording {clock(elapsed)} / {clock(MAX_RECORDING_SECONDS)}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={stop} aria-label="Stop recording and transcribe">
          <Square aria-hidden="true" />
          Stop
        </Button>
      </div>
    );
  }

  if (state === 'transcribing' || state === 'starting') {
    return (
      <span role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {state === 'starting' ? 'Starting microphone…' : 'Transcribing…'}
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      onClick={() => void start()}
      aria-label="Speak a message (up to 2 minutes)"
      title="Speak a message"
    >
      <Mic aria-hidden="true" />
    </Button>
  );
}
