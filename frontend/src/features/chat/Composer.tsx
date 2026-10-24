import { useRef, useState, type KeyboardEvent } from 'react'
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react'
import { ATTACHMENT_LIMITS } from '@/lib/api/endpoints'
import type { Attachment } from '@/types/schemas'
import { cn } from '@/lib/utils/cn'

interface Pending {
  localId: string
  name: string
  attachment?: Attachment
  error?: string
}

interface Props {
  disabled?: boolean
  upload: (file: File) => Promise<Attachment>
  onSend: (text: string, attachments: Attachment[]) => void
}

export function Composer({ disabled, upload, onSend }: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Pending[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  const uploading = files.some((f) => !f.attachment && !f.error)
  const ready = files.filter((f) => f.attachment).map((f) => f.attachment!)
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    setNotice(null)
    const incoming = Array.from(list)
    if (files.length + incoming.length > ATTACHMENT_LIMITS.maxPerMessage) {
      setNotice(`Você pode anexar até ${ATTACHMENT_LIMITS.maxPerMessage} arquivos por mensagem.`)
      return
    }
    for (const file of incoming) {
      const localId = `${file.name}-${Date.now()}-${Math.random()}`
      if (file.size > ATTACHMENT_LIMITS.maxBytes) {
        setNotice(`"${file.name}" tem mais de 10 MB.`)
        continue
      }
      setFiles((p) => [...p, { localId, name: file.name }])
      upload(file)
        .then((attachment) => setFiles((p) => p.map((f) => (f.localId === localId ? { ...f, attachment } : f))))
        .catch((e: Error) => {
          setFiles((p) => p.filter((f) => f.localId !== localId))
          setNotice(`Não foi possível enviar "${file.name}": ${e.message}`)
        })
    }
    if (input.current) input.current.value = ''
  }

  const submit = () => {
    if (!canSend) return
    onSend(text.trim(), ready)
    setText('')
    setFiles([])
    setNotice(null)
    if (area.current) area.current.style.height = 'auto'
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-line bg-surface px-3 pb-3 pt-2 sm:px-4">
      {notice && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {notice}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.localId} className="flex max-w-full items-center gap-1.5 rounded-lg bg-soft px-2.5 py-1 text-xs text-petrol">
              {f.attachment ? <FileText size={14} /> : <Loader2 size={14} className="animate-spin" />}
              <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" aria-label={`Remover ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.localId !== f.localId))}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input ref={input} type="file" multiple hidden accept={ATTACHMENT_LIMITS.accept} onChange={(e) => addFiles(e.target.files)} />
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          aria-label="Anexar arquivo"
          title="Anexar PDF, foto, planilha ou documento"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:bg-soft hover:text-ink disabled:opacity-50"
        >
          <Paperclip size={20} />
        </button>
        <textarea
          ref={area}
          value={text}
          rows={1}
          disabled={disabled}
          placeholder="Escreva sua mensagem…"
          aria-label="Mensagem"
          onChange={(e) => {
            setText(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
          }}
          onKeyDown={onKey}
          className="max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted focus:border-cyan disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Enviar"
          className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan text-on-cyan transition', canSend ? 'hover:brightness-95' : 'opacity-40')}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  )
}
