import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { useAuth } from '@/contexts/AuthContext'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate('/orgs', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <PageTitle title="Entrar" subtitle="Aura Casa ERP" />
      <Card>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Palavra-passe">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'A entrar…' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Sem conta?{' '}
          <Link className="font-medium text-violet-600 hover:underline" to="/register">
            Registar
          </Link>
        </p>
      </Card>
    </div>
  )
}
