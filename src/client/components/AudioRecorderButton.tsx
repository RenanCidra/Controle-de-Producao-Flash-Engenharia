import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { translateText } from '../i18n/index.ts';

const MAX_MS = 120_000;
const MIME_PREFERENCE = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
const t = (text: string) => translateText(text);

export const AudioRecorderButton: React.FC<{ onRecorded: (blob: Blob, durationMs: number) => Promise<void> | void; disabled?: boolean; label?: string }> = ({ onRecorded, disabled = false, label = 'Gravar áudio' }) => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stopTracks = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; };
  const stopRecording = () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); timerRef.current = null; if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); };

  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); try { recorderRef.current?.stop(); } catch { /* recorder already stopped */ } stopTracks(); }, []);

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError(t('Gravação de áudio não é suportada neste navegador.')); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MIME_PREFERENCE.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder; chunksRef.current = []; startedAtRef.current = Date.now();
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const duration = Math.min(MAX_MS, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stopTracks(); setRecording(false);
        if (blob.size > 5 * 1024 * 1024) { setError(t('O áudio excede o limite de 5 MB.')); return; }
        if (blob.size < 1) return;
        setBusy(true); try { await onRecorded(blob, duration); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o áudio.'); } finally { setBusy(false); }
      };
      recorder.start(250); setRecording(true);
      timerRef.current = window.setTimeout(stopRecording, MAX_MS);
    } catch (cause) { stopTracks(); setError(cause instanceof Error ? cause.message : t('Não foi possível acessar o microfone.')); }
  };

  return <div className="relative shrink-0">
    <button type="button" disabled={disabled || busy} onClick={() => recording ? stopRecording() : void start()} title={recording ? t('Parar e enviar áudio') : label} aria-label={recording ? t('Parar e enviar áudio') : label} className={`flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:opacity-40 ${recording ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-[#DCE3EB] bg-white text-slate-500 hover:border-[#FFAA00] hover:text-[#916B19]'}`}>{recording ? <Square size={16} fill="currentColor"/> : <Mic size={17}/>}</button>
    {error && <span role="alert" className="absolute bottom-12 right-0 z-40 w-56 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 shadow">{error}</span>}
    {recording && <span className="sr-only" aria-live="polite">{t('Gravando; limite de dois minutos.')}</span>}
  </div>;
};
