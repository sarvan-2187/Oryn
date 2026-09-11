import { useCallback, useEffect, useRef, useState } from 'react'
import { MicIcon, SquareIcon, PlayIcon, PauseIcon, Trash2Icon } from 'lucide-react'
import type { Attachment } from '../../../shared/types'

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** A small themed play/pause + scrubber, instead of the browser's native
 *  (always-light, never-reskinnable) <audio controls> chrome. */
function ClipPlayer({ src }: { src: string }): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)

  const toggle = (): void => {
    const el = audioRef.current
    if (!el) return
    if (playing) el.pause()
    else void el.play()
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setCurrent(el.currentTime)
  }

  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        className="hidden"
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-7 shrink-0 place-items-center rounded-full border border-accent bg-accent/15 text-accent transition-transform hover:scale-105"
      >
        {playing ? (
          <PauseIcon className="size-3.5" />
        ) : (
          <PlayIcon className="size-3.5 translate-x-px" />
        )}
      </button>
      <div onClick={seek} className="h-1.5 flex-1 cursor-pointer rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${duration ? (current / duration) * 100 : 0}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-faint">
        {formatTime(duration ? duration - current : 0)}
      </span>
    </div>
  )
}

export function VoiceNotes({ noteId }: { noteId: number }): React.JSX.Element {
  const [clips, setClips] = useState<Attachment[]>([])
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<number, string>>({})
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const refresh = useCallback(async () => {
    setClips(await window.oryn.attachments.list('note', noteId))
  }, [noteId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      clips.map(async (c) => {
        const base64 = await window.oryn.attachments.read(c.id)
        return [c.id, base64 ? `data:audio/webm;base64,${base64}` : null] as const
      })
    ).then((pairs) => {
      if (cancelled) return
      setUrls(Object.fromEntries(pairs.filter((p): p is [number, string] => p[1] != null)))
    })
    return () => {
      cancelled = true
    }
  }, [clips])

  const start = async (): Promise<void> => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const base64 = await blobToBase64(blob)
        await window.oryn.attachments.createAudio(noteId, base64)
        await refresh()
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setError('Could not access the microphone. Check Windows privacy settings for Oryn.')
      setRecording(false)
    }
  }

  const stop = (): void => {
    recorderRef.current?.stop()
    setRecording(false)
  }

  const remove = async (id: number): Promise<void> => {
    await window.oryn.attachments.delete(id)
    await refresh()
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] uppercase tracking-wider text-faint">
        Voice notes
        <button
          onClick={() => void (recording ? stop() : start())}
          className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] normal-case tracking-normal transition-colors ${
            recording
              ? 'border-danger bg-danger/15 text-danger'
              : 'border-border text-muted hover:border-accent hover:text-text'
          }`}
        >
          {recording ? (
            <>
              <span className="size-2 animate-pulse rounded-full bg-danger" />
              Stop
            </>
          ) : (
            <>
              <MicIcon className="size-3.5" />
              Record
            </>
          )}
        </button>
      </div>
      {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}
      {clips.length === 0 && !recording && !error && (
        <p className="text-[13px] text-faint">No voice notes yet.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {clips.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            {urls[c.id] ? (
              <ClipPlayer src={urls[c.id]} />
            ) : (
              <div className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-faint">
                Loading…
              </div>
            )}
            <button
              onClick={() => void remove(c.id)}
              aria-label="Delete voice note"
              className="text-faint hover:text-danger"
            >
              <Trash2Icon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
