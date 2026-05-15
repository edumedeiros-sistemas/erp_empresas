import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { useAuth } from '@/contexts/AuthContext'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function RegisterPage() {
  const { register } = useAuth()
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
      await register(email.trim(), password)
      navigate('/orgs', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no registo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <PageTitle title="Criar conta" subtitle="Aura Casa ERP" />
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
          <Field label="Palavra-passe (mín. 6 caracteres)">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'A criar…' : 'Registar'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Já tem conta?{' '}
          <Link className="font-medium text-violet-600 hover:underline" to="/login">
            Entrar
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Depois de criar a conta e entrar, em <strong className="font-medium">Organizações</strong> use{' '}
          <strong className="font-medium">Pedir acesso a empresa</strong> para solicitar entrada numa equipa existente.
        </p>
      </Card>
    </div>
  )
}
