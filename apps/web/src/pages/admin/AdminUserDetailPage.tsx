import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { useAuth } from '@/contexts/AuthContext'
import {
  deleteUserFirestoreData,
  listUserMembershipsForAdmin,
  repairUserOrgIdsFromMembers,
  removeUserFromOrgMembership,
  updateUserEmailAdmin,
  type UserMembershipRow,
} from '@/lib/orgMembershipSync'
import { userDoc } from '@/lib/firestorePaths'
import { isSuperAdminEmail, isSuperAdminUser } from '@/lib/superAdmin'
import type { MemberRole } from '@/types'
import { getDoc } from 'firebase/firestore'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

function roleLabel(r: MemberRole): string {
  if (r === 'owner') return 'Proprietário'
  if (r === 'admin') return 'Administrador'
  return 'Equipa'
}

export default function AdminUserDetailPage() {
  const { uid: routeUid } = useParams<{ uid: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const uid = routeUid ?? ''

  const [email, setEmail] = useState('')
  const [profileOrgIds, setProfileOrgIds] = useState<string[]>([])
  const [memberships, setMemberships] = useState<UserMembershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [emailBusy, setEmailBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    setErr(null)
    try {
      const us = await getDoc(userDoc(db, uid))
      if (!us.exists()) {
        setErr('Utilizador não encontrado na coleção users.')
        setEmail('')
        setProfileOrgIds([])
        setMemberships([])
        return
      }
      const data = us.data() as Record<string, unknown>
      setEmail(String(data.email ?? ''))
      setProfileOrgIds((data.orgIds as string[] | undefined) ?? [])
      setMemberships(await listUserMembershipsForAdmin(uid))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      setLoading(false)
    }
  }, [uid])

  useEffect(() => {
    void load()
  }, [load])

  if (!user || !isSuperAdminUser(user)) {
    return <Navigate to="/app" replace />
  }
  if (!uid) {
    return <Navigate to="/app/admin/utilizadores" replace />
  }

  const targetIsSuperAdmin = isSuperAdminEmail(email)

  async function saveEmail(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (!email.trim()) {
      setErr('Indique o email.')
      return
    }
    setEmailBusy(true)
    try {
      await updateUserEmailAdmin(uid, email.trim())
      setMsg('Email atualizado (perfil, lookup e documentos member).')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao guardar.')
    } finally {
      setEmailBusy(false)
    }
  }

  async function repairLinks() {
    setErr(null)
    setMsg(null)
    setSyncBusy(true)
    try {
      const repaired = await repairUserOrgIdsFromMembers(uid)
      setMsg(`Vínculos reparados: ${repaired.length} empresa(s) no perfil.`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao sincronizar.')
    } finally {
      setSyncBusy(false)
    }
  }

  async function removeFromOrg(orgId: string, orgName: string) {
    if (!window.confirm(`Remover este utilizador da empresa «${orgName}»?`)) return
    setErr(null)
    setMsg(null)
    try {
      await removeUserFromOrgMembership(uid, orgId)
      setMsg('Removido da empresa.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao remover.')
    }
  }

  async function deleteUser() {
    if (!user || uid === user.uid) {
      setErr('Não pode eliminar a sua própria conta aqui.')
      return
    }
    if (targetIsSuperAdmin) {
      setErr('Não pode eliminar o administrador global.')
      return
    }
    if (deleteConfirm.trim().toUpperCase() !== 'ELIMINAR') {
      setErr('Escreva ELIMINAR para confirmar.')
      return
    }
    setDeleteBusy(true)
    setErr(null)
    try {
      await deleteUserFirestoreData(uid)
      navigate('/app/admin/utilizadores', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao eliminar.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Gerir utilizador"
        subtitle={uid}
        actions={
          <Link
            to="/app/admin/utilizadores"
            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300"
          >
            ← Lista de utilizadores
          </Link>
        }
      />

      {msg ? <p className="mb-3 text-sm text-emerald-600">{msg}</p> : null}
      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

      {loading ? (
        <p className="text-sm text-zinc-500">A carregar…</p>
      ) : (
        <>
          <Card className="mb-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Perfil</h2>
            <form onSubmit={saveEmail} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Field label="Email">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" disabled={emailBusy}>
                {emailBusy ? 'A guardar…' : 'Guardar email'}
              </Button>
            </form>
            <p className="mt-2 font-mono text-xs text-zinc-500">UID: {uid}</p>
            {targetIsSuperAdmin ? (
              <p className="mt-2 text-xs text-violet-600">Administrador global do sistema.</p>
            ) : null}
          </Card>

          <Card className="mb-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Empresas vinculadas ({memberships.length})
              </h2>
              <Button type="button" variant="secondary" className="text-xs py-1" disabled={syncBusy} onClick={() => void repairLinks()}>
                {syncBusy ? 'A sincronizar…' : 'Reparar vínculos no perfil'}
              </Button>
            </div>
            {profileOrgIds.length > memberships.length ? (
              <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                O perfil tem {profileOrgIds.length} ID(s) em orgIds, mas só {memberships.length} membro(s) ativo(s). Use
                «Reparar vínculos» para alinhar.
              </p>
            ) : null}
            {memberships.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma empresa (sem documentos em members).</p>
            ) : (
              <ul className="space-y-2">
                {memberships.map((m) => (
                  <li
                    key={m.orgId}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{m.orgName}</p>
                      <p className="text-xs text-zinc-500">
                        {roleLabel(m.role)} · <span className="font-mono">{m.orgId}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/app/admin/empresa/${m.orgId}`}
                        className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        Gerir empresa
                      </Link>
                      <Button
                        type="button"
                        variant="danger"
                        className="text-xs py-1"
                        onClick={() => void removeFromOrg(m.orgId, m.orgName)}
                      >
                        Remover desta empresa
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="border-red-200 dark:border-red-900">
            <h2 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-200">Zona perigosa</h2>
            <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
              Apaga o perfil Firestore, lookup público e membros em todas as empresas. A conta de login no Firebase
              Authentication tem de ser removida manualmente na consola Firebase, se necessário.
            </p>
            <Field label="Confirmação">
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Escreva ELIMINAR"
              />
            </Field>
            <Button
              type="button"
              variant="danger"
              className="mt-3"
              disabled={deleteBusy || !user || uid === user.uid || targetIsSuperAdmin}
              onClick={() => void deleteUser()}
            >
              {deleteBusy ? 'A eliminar…' : 'Eliminar utilizador (dados Firestore)'}
            </Button>
          </Card>
        </>
      )}
    </div>
  )
}
