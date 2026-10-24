import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Card, Input, Logo, Select } from '@/components/ui'
import { chatApi } from '@/lib/api/endpoints'
import type { SessionResponse } from '@/types/schemas'
import { isValidPhone, maskPhone, toE164 } from './phone'

/** Por ora o chat atende só Cascavel (PR): é a única opção do cadastro e vai como parâmetro para o back. */
const CIDADE = { value: 'cascavel-pr', label: 'Cascavel - PR', municipality: { name: 'Cascavel' } } as const

interface Props {
  onReady: (s: SessionResponse) => void
}

/**
 * Entrada sem login: telefone → (se desconhecido) prefeitura + secretaria.
 * Com WhatsApp, o telefone virá do canal e só o passo 2 (se preciso) continua existindo.
 */
export function IdentifyFlow({ onReady }: Props) {
  const [step, setStep] = useState<'phone' | 'register'>('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [regToken, setRegToken] = useState('')
  const [mun, setMun] = useState('')
  const [sec, setSec] = useState('')
  const [touched, setTouched] = useState(false)

  const identify = useMutation({
    mutationFn: () => chatApi.identify(toE164(phone)),
    onSuccess: (r) => {
      if (r.known) onReady(r)
      else {
        setRegToken(r.registrationToken)
        setTouched(false)
        setStep('register')
      }
    },
  })

  const register = useMutation({
    mutationFn: () =>
      chatApi.register({
        registrationToken: regToken,
        phone: toE164(phone),
        name: name.trim() || undefined,
        municipality: CIDADE.municipality,
        secretariat: { name: sec.trim() },
      }),
    onSuccess: onReady,
  })

  const phoneError = touched && !isValidPhone(phone) ? 'Informe o telefone com DDD.' : undefined
  const munOk = mun === CIDADE.value
  const secOk = sec.trim().length > 1
  const regError = (ok: boolean, msg: string) => (touched && !ok ? msg : undefined)

  const onPhone = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (isValidPhone(phone)) identify.mutate()
  }
  const onRegister = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (munOk && secOk) register.mutate()
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-1"><Logo className="h-7" /><span className="text-sm text-muted">Implantação</span></div>
        <Card className="p-6">
          {step === 'phone' ? (
            <form onSubmit={onPhone} className="flex flex-col gap-4" noValidate>
              <div>
                <h1 className="text-xl font-semibold">Olá! Vamos começar</h1>
                <p className="mt-1 text-sm text-muted">
                  Informe seu telefone para o assistente reconhecer sua prefeitura e continuar de onde parou.
                </p>
              </div>
              <Input
                label="Telefone (com DDD)"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                placeholder="(51) 99999-8888"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                error={phoneError}
              />
              {identify.isError && <p role="alert" className="text-sm text-danger">{identify.error.message}</p>}
              <Button type="submit" size="lg" loading={identify.isPending}>
                Continuar
              </Button>
            </form>
          ) : (
            <form onSubmit={onRegister} className="flex flex-col gap-4" noValidate>
              <div>
                <h1 className="text-xl font-semibold">Primeiro acesso</h1>
                <p className="mt-1 text-sm text-muted">Não encontramos este número. Conte de qual prefeitura e secretaria você é.</p>
              </div>
              <Input label="Seu nome (opcional)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              <Select
                label="Prefeitura"
                placeholder="Selecione"
                value={mun}
                onChange={(e) => setMun(e.target.value)}
                options={[{ value: CIDADE.value, label: CIDADE.label }]}
                error={regError(munOk, 'Selecione a prefeitura.')}
              />
              {mun && (
                <Input label="Secretaria" value={sec} onChange={(e) => setSec(e.target.value)} error={regError(secOk, 'Informe a secretaria.')} />
              )}
              {register.isError && <p role="alert" className="text-sm text-danger">{register.error.message}</p>}
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={() => { setStep('phone'); setTouched(false) }}>
                  Voltar
                </Button>
                <Button type="submit" size="lg" className="flex-1" loading={register.isPending}>
                  Iniciar conversa
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
