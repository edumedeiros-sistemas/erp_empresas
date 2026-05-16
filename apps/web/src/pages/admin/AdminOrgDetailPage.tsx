import { Button, Card, Field, Input, PageTitle, Select } from '@/components/Ui'
import { db } from '@/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { deleteOrganizationTree } from '@/lib/deleteOrgTree'
import { repairUserOrgIdsFromMembers } from '@/lib/orgMembershipSync'
import { normalizeEmail } from '@/lib/emailNormalize'
import {
  membersCol,
  orgDirectoryDoc,
  orgDoc,
  userDoc,
  userPublicLookupCol,
  userPublicLookupDoc,
} from '@/lib/firestorePaths'
import { isSuperAdminUser } from '@/lib/superAdmin'
import type { MemberRole } from '@/types'
import {
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

type MemRow = { id: string; role: MemberRole; email: string | null }

export default function AdminOrgDetailPage() {
  const { orgId: routeOrgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { orgId: activeOrgId, setOrgId, refreshOrgs } = useOrg()

  const [orgName, setOrgName] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [members, setMembers] = useState<MemRow[]>([])
  const [rolesDraft, setRolesDraft] = useState<Record<string, MemberRole>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  const [addEmail, setAddEmail] = useState('')
  const [addUid, setAddUid] = useState<string | null>(null)
  const [addRole, setAddRole] = useState<MemberRole>('staff')
  const [addBusy, setAddBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<{ uid: string; email: string; emailLower: string }[]>([])

  const oid = routeOrgId ?? ''

  const myLower = useMemo(() => normalizeEmail(user?.email ?? ''), [user?.email])

  useEffect(() => {
    if (!oid) return
    let cancelled = false
    ;(async () => {
      const s = await getDoc(orgDoc(db, oid))
      if (cancelled || !s.exists()) return
      setOrgName(String((s.data() as { name?: string }).name ?? ''))
    })()
    return () => {
      cancelled = true
    }
  }, [oid])

  useEffect(() => {
    if (!oid) return
    const q = membersCol(db, oid)
    const unsub = onSnapshot(q, (snap) => {
      const rows: MemRow[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>
        return {
          id: d.id,
          role: (x.role as MemberRole) ?? 'staff',
          email: (x.email as string | null) ?? null,
        }
      })
      rows.sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '', 'pt-BR'))
      setMembers(rows)
      const rd: Record<string, MemberRole> = {}
      for (const r of rows) rd[r.id] = r.role
      setRolesDraft(rd)
    })
    return () => unsub()
  }, [oid])

  useEffect(() => {
    const raw = addEmail.trim().toLowerCase()
    if (raw.length < 1) {
      setSuggestions([])
      return
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const q = query(
            userPublicLookupCol(db),
            where('emailLower', '>=', raw),
            where('emailLower', '<=', `${raw}\uf8ff`),
            limit(20),
          )
          const snap = await getDocs(q)
          setSuggestions(
            snap.docs
              .filter((d) => d.id !== user?.uid)
              .map((d) => {
                const x = d.data() as Record<string, unknown>
                return {
                  uid: d.id,
                  email: String(x.email ?? ''),
                  emailLower: String(x.emailLower ?? ''),
                }
              }),
          )
        } catch {
          setSuggestions([])
        }
      })()
    }, 200)
    return () => clearTimeout(t)
  }, [addEmail, user?.uid])

  if (!user || !isSuperAdminUser(user)) {
    return <Navigate to="/app" replace />
  }
  if (!oid) {
    return <Navigate to="/app/admin/empresas" replace />
  }

  const ownerCount = members.filter((m) => m.role === 'owner').length

  async function saveOrgName(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    const n = orgName.trim()
    if (!n) return
    setNameBusy(true)
    try {
      await updateDoc(orgDoc(db, oid), { name: n, updatedAt: serverTimestamp() })
      await setDoc(orgDirectoryDoc(db, oid), { name: n, updatedAt: serverTimestamp() }, { merge: true })
      setMsg('Nome atualizado.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao guardar.')
    } finally {
      setNameBusy(false)
    }
  }

  async function resolveUidByEmail(lower: string): Promise<{ uid: string; email: string } | null> {
    const q = query(userPublicLookupCol(db), where('emailLower', '==', lower), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) return null
    const d = snap.docs[0]!
    const x = d.data() as Record<string, unknown>
    return { uid: d.id, email: String(x.email ?? lower) }
  }

  async function addMember() {
    setErr(null)
    setMsg(null)
    const emailTrim = addEmail.trim()
    const lower = normalizeEmail(emailTrim)
    if (!lower) {
      setErr('Indique um email.')
      return
    }
    if (lower === myLower) {
      setErr('Não pode adicionar a si próprio.')
      return
    }
    setAddBusy(true)
    try {
      let uid = addUid
      let email = emailTrim
      if (uid) {
        const ls = await getDoc(userPublicLookupDoc(db, uid))
        if (ls.exists()) {
          const xl = ls.data() as Record<string, unknown>
          if (normalizeEmail(String(xl.emailLower ?? '')) === lower) {
            email = String(xl.email ?? emailTrim)
          }
        }
      } else {
        const r = await resolveUidByEmail(lower)
        if (!r) {
          setErr('Conta não encontrada. O utilizador tem de entrar na app pelo menos uma vez.')
          return
        }
        uid = r.uid
        email = r.email
      }
      if (!uid) return
      const memRef = doc(membersCol(db, oid), uid)
      const ex = await getDoc(memRef)
      if (ex.exists()) {
        setErr('Já é membro desta empresa.')
        return
      }
      const role = addRole
      const batch = writeBatch(db)
      batch.set(memRef, {
        role,
        email,
        memberUid: uid,
        joinedAt: serverTimestamp(),
      })
      batch.set(userDoc(db, uid), { orgIds: arrayUnion(oid) }, { merge: true })
      await batch.commit()
      setAddEmail('')
      setAddUid(null)
      setAddRole('staff')
      setSuggestions([])
      setMsg('Utilizador adicionado.')
      await refreshOrgs()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao adicionar.')
    } finally {
      setAddBusy(false)
    }
  }

  async function saveMemberRole(memberId: string) {
    setErr(null)
    setMsg(null)
    const next = rolesDraft[memberId]
    if (!next) {
      setErr('Função inválida.')
      return
    }
    const prev = members.find((m) => m.id === memberId)?.role
    if (prev === 'owner' && next !== 'owner' && ownerCount <= 1) {
      setErr('Tem de existir pelo menos um proprietário.')
      return
    }
    try {
      await updateDoc(doc(membersCol(db, oid), memberId), { role: next })
      setMsg('Função atualizada.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao atualizar.')
    }
  }

  async function syncMemberLink(memberId: string) {
    setErr(null)
    setMsg(null)
    try {
      const repaired = await repairUserOrgIdsFromMembers(memberId)
      if (!repaired.includes(oid)) {
        setErr('Este utilizador não tem documento member nesta empresa. Adicione-o de novo.')
        return
      }
      setMsg(`Vínculo reparado (${repaired.length} empresa(s) no perfil).`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao sincronizar.')
    }
  }

  async function removeMember(memberId: string) {
    setErr(null)
    setMsg(null)
    const m = members.find((x) => x.id === memberId)
    if (!m) return
    if (m.role === 'owner' && ownerCount <= 1) {
      setErr('Não pode remover o único proprietário.')
      return
    }
    if (!window.confirm(`Remover ${m.email ?? memberId} desta empresa?`)) return
    try {
      await deleteDoc(doc(membersCol(db, oid), memberId))
      const uref = userDoc(db, memberId)
      const us = await getDoc(uref)
      if (us.exists()) {
        const orgIds = ((us.data() as { orgIds?: string[] }).orgIds ?? []).filter((x) => x !== oid)
        await updateDoc(uref, { orgIds })
      }
      setMsg('Membro removido.')
      if (activeOrgId === oid) await refreshOrgs()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao remover.')
    }
  }

  const runDeleteOrg = useCallback(async () => {
    if (deleteConfirm.trim().toUpperCase() !== 'ELIMINAR') {
      setErr('Escreva ELIMINAR para confirmar.')
      return
    }
    setDeleteBusy(true)
    setErr(null)
    try {
      await deleteOrganizationTree(oid)
      if (activeOrgId === oid) {
        setOrgId(null)
        await refreshOrgs()
      }
      navigate('/app/admin/empresas', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao eliminar.')
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteConfirm, oid, activeOrgId, setOrgId, refreshOrgs, navigate])

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Gerir empresa"
        subtitle={oid}
        actions={
          <Link
            to="/app/admin/empresas"
            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300"
          >
            ← Lista de empresas
          </Link>
        }
      />

      {msg ? <p className="mb-3 text-sm text-emerald-600">{msg}</p> : null}
      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Nome da empresa</h2>
        <form onSubmit={saveOrgName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Nome">
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </Field>
          <Button type="submit" disabled={nameBusy}>
            {nameBusy ? 'A guardar…' : 'Guardar nome'}
          </Button>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Adicionar utilizador</h2>
        <p className="mb-3 text-xs text-zinc-500">Só contas que já existem em userPublicLookup (entraram na app).</p>
        <div className="space-y-2">
          <Field label="Email">
            <div className="relative z-20">
              <Input
                type="email"
                value={addEmail}
                onChange={(e) => {
                  setAddEmail(e.target.value)
                  setAddUid(null)
                }}
                placeholder="Escrever email…"
                autoComplete="off"
              />
              {suggestions.length > 0 ? (
                <ul className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-44 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  {suggestions.map((s) => (
                    <li key={s.uid}>
                      <button
                        type="button"
                        className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setAddEmail(s.email)
                          setAddUid(s.uid)
                          setSuggestions([])
                        }}
                      >
                        {s.email}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Field>
          <Field label="Função">
            <Select value={addRole} onChange={(e) => setAddRole(e.target.value as MemberRole)}>
              <option value="staff">Equipa</option>
              <option value="admin">Administrador</option>
              <option value="owner">Proprietário</option>
            </Select>
          </Field>
          <Button type="button" disabled={addBusy} onClick={() => void addMember()}>
            {addBusy ? 'A adicionar…' : 'Adicionar à empresa'}
          </Button>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Membros ({members.length})</h2>
        <ul className="space-y-3">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{m.email ?? m.id}</p>
                <p className="font-mono text-xs text-zinc-500">{m.id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full max-w-[10rem]">
                  <Select
                    value={rolesDraft[m.id] ?? m.role}
                    onChange={(e) =>
                      setRolesDraft((prev) => ({ ...prev, [m.id]: e.target.value as MemberRole }))
                    }
                  >
                    <option value="owner">Proprietário</option>
                    <option value="admin">Administrador</option>
                    <option value="staff">Equipa</option>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs py-1"
                  disabled={(rolesDraft[m.id] ?? m.role) === m.role}
                  onClick={() => void saveMemberRole(m.id)}
                >
                  Guardar função
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs py-1"
                  onClick={() => void syncMemberLink(m.id)}
                >
                  Sincronizar vínculo
                </Button>
                <Button type="button" variant="danger" className="text-xs py-1" onClick={() => void removeMember(m.id)}>
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <h2 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-200">Zona perigosa</h2>
        <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
          Elimina todos os dados desta empresa (clientes, produtos, vendas, etc.). Escreva <strong>ELIMINAR</strong> para
          confirmar.
        </p>
        <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Confirmação">
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="ELIMINAR" />
          </Field>
          <Button type="button" variant="danger" disabled={deleteBusy} onClick={() => void runDeleteOrg()}>
            {deleteBusy ? 'A eliminar…' : 'Eliminar empresa'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
