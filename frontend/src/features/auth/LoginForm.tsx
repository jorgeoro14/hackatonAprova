import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { useLogin } from '@/lib/api/hooks'
import { ApiError } from '@/lib/api/client'

export function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const login = useLogin()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!username.trim() || !password) return
    login.mutate(
      { username: username.trim(), password },
      { onSuccess: () => navigate(from?.startsWith('/dashboard') ? from : '/dashboard', { replace: true }) },
    )
  }

  const serverMsg =
    login.error instanceof ApiError && login.error.status === 401 ? 'Usuário ou senha inválidos.' : login.error?.message

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Input
        label="Usuário"
        autoComplete="username"
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={touched && !username.trim() ? 'Informe o usuário.' : undefined}
      />
      <Input
        label="Senha"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={touched && !password ? 'Informe a senha.' : undefined}
      />
      {login.isError && <p role="alert" className="text-sm text-danger">{serverMsg}</p>}
      <Button type="submit" size="lg" loading={login.isPending}>Entrar</Button>
    </form>
  )
}
