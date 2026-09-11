import { useCallback, useEffect, useRef, useState } from 'react'
import { MicIcon, SquareIcon, Trash2Icon } from 'lucide-react'
import type { Attachment } from '../../../shared/types'

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function VoiceNotes({ noteId }: { noteId: number }): React.JSX.Element {
  const [clips, setClips] = useState<Attachment[]>([])
  const [recording, setRecording] = useState(false)
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
          className={`ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] normal-case tracking-normal ${
            recording ? 'border-danger text-danger' : 'border-border text-muted hover:text-text'
          }`}
        >
          {recording ? <SquareIcon className="size-3.5" /> : <MicIcon className="size-3.5" />}
          {recording ? 'Stop' : 'Record'}
        </button>
      </div>
      {clips.length === 0 && !recording && (
        <p className="text-[13px] text-faint">No voice notes yet.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {clips.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            {urls[c.id] && <audio controls src={urls[c.id]} className="h-8 flex-1" />}
            <button onClick={() => void remove(c.id)} aria-label="Delete voice note">
              <Trash2Icon className="size-3.5 text-faint hover:text-danger" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
