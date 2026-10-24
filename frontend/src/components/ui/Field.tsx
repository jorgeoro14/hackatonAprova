import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

const control =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted transition focus:border-cyan disabled:opacity-60 aria-[invalid=true]:border-danger'

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  className?: string
}

/** Wrapper de label + controle + mensagem de erro/dica. */
function Wrap({ label, hint, error, className, id, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}

export function Input({ label, hint, error, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Wrap {...{ label, hint, error, className, id }}>
      <input id={id} aria-invalid={!!error} className={cn(control, 'h-10')} {...rest} />
    </Wrap>
  )
}

export function Textarea({ label, hint, error, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <Wrap {...{ label, hint, error, className, id }}>
      <textarea id={id} aria-invalid={!!error} className={cn(control, 'min-h-24 py-2')} {...rest} />
    </Wrap>
  )
}

export function Select({
  label,
  hint,
  error,
  className,
  options,
  placeholder,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const id = useId()
  return (
    <Wrap {...{ label, hint, error, className, id }}>
      <select id={id} aria-invalid={!!error} className={cn(control, 'h-10')} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  )
}
