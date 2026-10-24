import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Input, Select } from '@/components/ui'
import { catalogApi, chatApi } from '@/lib/api/endpoints'
import type { SessionResponse } from '@/types/schemas'
import { isValidPhone, maskPhone, toE164 } from './phone'

const OTHER = '__other'

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
  const [munOther, setMunOther] = useState('')
  const [sec, setSec] = useState('')
  const [secOther, setSecOther] = useState('')
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

  const municipalities = useQuery({ queryKey: ['catalog', 'municipalities'], queryFn: () => catalogApi.municipalities(), enabled: step === 'register' })
  const munId = mun && mun !== OTHER ? mun : ''
  const secretariats = useQuery({
    queryKey: ['catalog', 'secretariats', munId],
    queryFn: () => catalogApi.secretariats(munId),
    enabled: !!munId,
  })

  const register = useMutation({
    mutationFn: () =>
      chatApi.register({
        registrationToken: regToken,
        phone: toE164(phone),
        name: name.trim() || undefined,
        municipality: mun === OTHER ? { name: munOther.trim() } : { id: mun },
        secretariat: sec === OTHER || mun === OTHER ? { name: secOther.trim() } : { id: sec },
      }),
    onSuccess: onReady,
  })

  const phoneError = touched && !isValidPhone(phone) ? 'Informe o telefone com DDD.' : undefined
  const munOk = mun === OTHER ? munOther.trim().length > 1 : !!mun
  const secOk = mun === OTHER || sec === OTHER ? secOther.trim().length > 1 : !!sec
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
        <p className="mb-6 text-center font-title text-2xl font-semibold">
          aprova<span className="text-cyan">.</span> <span className="font-normal text-muted">implantação</span>
        </p>
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
                placeholder={municipalities.isLoading ? 'Carregando…' : 'Selecione'}
                value={mun}
                onChange={(e) => { setMun(e.target.value); setSec('') }}
                options={[...(municipalities.data ?? []).map((m) => ({ value: m.id, label: `${m.name} - ${m.uf}` })), { value: OTHER, label: 'Outra (não está na lista)' }]}
                error={regError(munOk, 'Selecione a prefeitura.')}
              />
              {mun === OTHER && (
                <Input label="Nome da prefeitura" value={munOther} onChange={(e) => setMunOther(e.target.value)} error={regError(munOk, 'Informe o nome.')} />
              )}
              {mun && mun !== OTHER && (
                <Select
                  label="Secretaria"
                  placeholder={secretariats.isLoading ? 'Carregando…' : 'Selecione'}
                  value={sec}
                  onChange={(e) => setSec(e.target.value)}
                  options={[...(secretariats.data ?? []).map((s) => ({ value: s.id, label: s.name })), { value: OTHER, label: 'Outra (não está na lista)' }]}
                  error={regError(secOk, 'Selecione a secretaria.')}
                />
              )}
              {(mun === OTHER || sec === OTHER) && (
                <Input label="Nome da secretaria" value={secOther} onChange={(e) => setSecOther(e.target.value)} error={regError(secOk, 'Informe o nome.')} />
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
