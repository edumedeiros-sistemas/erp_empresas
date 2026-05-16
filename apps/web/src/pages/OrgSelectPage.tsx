import { Button, Card, Field, Input, PageTitle, Select } from '@/components/Ui'
import { db } from '@/firebase'
import {
  accessRequestsCol,
  invitesCol,
  membersCol,
  orgDirectoryDoc,
  orgDoc,
  userDoc,
  userPublicLookupCol,
  userPublicLookupDoc,
} from '@/lib/firestorePaths'
import { normalizeEmail } from '@/lib/emailNormalize'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import type { MemberRole, OrgAccessRequest } from '@/types'
import {
  arrayUnion,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  limit,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { OrgListNavState } from '@/lib/orgNav'

type ReceivedInvite = {
  id: string
  orgId: string
  orgName: string
  role: MemberRole
  emailLower: string
}

type AccessReqRow = OrgAccessRequest & { id: string }

function roleLabel(r: MemberRole): string {
  if (r === 'owner') return 'Proprietário'
  if (r === 'admin') return 'Administrador'
  return 'Equipa'
}

export default function OrgSelectPage() {
  const { user, logout } = useAuth()
  const { orgIds, setOrgId, createOrganization, loadingList, refreshOrgs } = useOrg()
  const navigate = useNavigate()
  const location = useLocation()
  const [names, setNames] = useState<Record<string, string>>({})
  const [roles, setRoles] = useState<Record<string, MemberRole | null>>({})
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [receivedInvites, setReceivedInvites] = useState<ReceivedInvite[]>([])
  const [manageOrgId, setManageOrgId] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [selectedMemberUid, setSelectedMemberUid] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<MemberRole>('staff')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<{ uid: string; email: string; emailLower: string }[]>([])
  const [accessRequests, setAccessRequests] = useState<AccessReqRow[]>([])

  const myEmailLower = useMemo(() => normalizeEmail(user?.email ?? ''), [user?.email])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const entries: Record<string, string> = {}
      const r: Record<string, MemberRole | null> = {}
      for (const id of orgIds) {
        const [osnap, msnap] = await Promise.all([getDoc(orgDoc(db, id)), getDoc(doc(membersCol(db, id), user!.uid))])
        if (!cancelled && osnap.exists()) entries[id] = (osnap.data().name as string) ?? id
        if (!cancelled && msnap.exists()) r[id] = (msnap.data().role as MemberRole) ?? 'staff'
        else if (!cancelled) r[id] = null
      }
      if (!cancelled) {
        setNames(entries)
        setRoles(r)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgIds, user])

  /** Publica empresas antigas no diretório (uma vez por sessão por org). */
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      for (const id of orgIds) {
        const role = roles[id]
        if (role !== 'owner' && role !== 'admin') continue
        const name = names[id]
        if (!name) continue
        const dref = orgDirectoryDoc(db, id)
        const d = await getDoc(dref)
        if (cancelled) return
        if (!d.exists()) {
          try {
            await setDoc(dref, { name, updatedAt: serverTimestamp() })
          } catch {
            /* ignore */
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgIds, names, roles, user])

  useEffect(() => {
    if (!user?.email || !myEmailLower) {
      setReceivedInvites([])
      return
    }
    const q = query(
      collectionGroup(db, 'invites'),
      where('emailLower', '==', myEmailLower),
      where('status', '==', 'pending'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ReceivedInvite[] = snap.docs.map((d) => {
          const orgId = d.ref.parent.parent?.id ?? ''
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            orgId,
            orgName: String(x.orgName ?? orgId),
            role: (x.role as MemberRole) ?? 'staff',
            emailLower: String(x.emailLower ?? ''),
          }
        })
        setReceivedInvites(list)
      },
      () => setReceivedInvites([]),
    )
    return () => unsub()
  }, [user?.email, myEmailLower])

  const loadOrgAccessUi = useCallback(
    (orgId: string) => {
      if (!user) return () => {}
      const role = roles[orgId]
      if (role !== 'owner' && role !== 'admin') return () => {}

      const qReq = query(accessRequestsCol(db, orgId), where('status', '==', 'pending'))
      const unsubReq = onSnapshot(qReq, (snap) => {
        setAccessRequests(
          snap.docs.map((d) => {
            const x = d.data() as Record<string, unknown>
            return {
              id: d.id,
              requesterUid: String(x.requesterUid ?? ''),
              requesterEmail: String(x.requesterEmail ?? ''),
              status: (x.status as OrgAccessRequest['status']) ?? 'pending',
              createdAt: x.createdAt as OrgAccessRequest['createdAt'],
              resolvedAt: (x.resolvedAt as OrgAccessRequest['resolvedAt']) ?? null,
              resolvedByUid: (x.resolvedByUid as string | null) ?? null,
            }
          }),
        )
      })

      return () => {
        unsubReq()
      }
    },
    [user, roles],
  )

  useEffect(() => {
    if (!manageOrgId) {
      setAccessRequests([])
      return
    }
    const role = roles[manageOrgId]
    if (role !== 'owner' && role !== 'admin') return
    return loadOrgAccessUi(manageOrgId)
  }, [manageOrgId, roles, loadOrgAccessUi])

  useEffect(() => {
    const raw = inviteEmail.trim().toLowerCase()
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
            limit(25),
          )
          const snap = await getDocs(q)
          setSuggestions(
            snap.docs
              .filter((d) => d.id !== user?.uid)
              .slice(0, 15)
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
    }, 220)
    return () => clearTimeout(t)
  }, [inviteEmail, user?.uid])

  function openOrg(id: string) {
    setOrgId(id)
    navigate('/app', { replace: true })
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!newName.trim()) return
    setBusy(true)
    try {
      await createOrganization(newName.trim())
      setNewName('')
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.')
    } finally {
      setBusy(false)
    }
  }

  async function acceptInvite(inv: ReceivedInvite) {
    if (!user) return
    setError(null)
    try {
      const memRef = doc(membersCol(db, inv.orgId), user.uid)
      const memSnap = await getDoc(memRef)
      if (memSnap.exists()) {
        setError('Já é membro desta empresa.')
        return
      }
      const inviteRef = doc(invitesCol(db, inv.orgId), inv.id)
      const b = writeBatch(db)
      b.set(memRef, {
        role: inv.role,
        email: user.email ?? null,
        memberUid: user.uid,
        joinedAt: serverTimestamp(),
        inviteId: inv.id,
      })
      b.update(inviteRef, { status: 'used' })
      b.set(
        userDoc(db, user.uid),
        { orgIds: arrayUnion(inv.orgId) },
        { merge: true },
      )
      await b.commit()
      await refreshOrgs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.')
    }
  }

  async function declineInvite(inv: ReceivedInvite) {
    setError(null)
    try {
      await updateDoc(doc(invitesCol(db, inv.orgId), inv.id), { status: 'declined' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível recusar.')
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

  async function addMemberToOrg(orgId: string) {
    if (!user) return
    const emailTrim = inviteEmail.trim()
    const lower = normalizeEmail(emailTrim)
    setInviteError(null)
    if (!emailTrim || !lower) {
      setInviteError('Indique o email do utilizador.')
      return
    }
    if (lower === myEmailLower) {
      setInviteError('Não pode adicionar a si próprio.')
      return
    }
    setInviteBusy(true)
    try {
      let targetUid: string | null = selectedMemberUid
      let memberEmail = emailTrim

      if (targetUid) {
        const lsnap = await getDoc(userPublicLookupDoc(db, targetUid))
        if (lsnap.exists()) {
          const xl = lsnap.data() as Record<string, unknown>
          if (normalizeEmail(String(xl.emailLower ?? '')) === lower) {
            memberEmail = String(xl.email ?? emailTrim)
          }
        }
      } else {
        const resolved = await resolveUidByEmail(lower)
        if (!resolved) {
          setInviteError(
            'Nenhuma conta encontrada com este email. A pessoa tem de criar conta e entrar na app pelo menos uma vez.',
          )
          return
        }
        targetUid = resolved.uid
        memberEmail = resolved.email
      }

      if (!targetUid || targetUid === user.uid) {
        setInviteError('Não pode adicionar a si próprio.')
        return
      }
      const memRef = doc(membersCol(db, orgId), targetUid)
      const existing = await getDoc(memRef)
      if (existing.exists()) {
        setInviteError('Este utilizador já é membro desta empresa.')
        return
      }
      const role = inviteRole === 'owner' ? 'staff' : inviteRole
      const b = writeBatch(db)
      b.set(memRef, {
        role,
        email: memberEmail,
        memberUid: targetUid,
        joinedAt: serverTimestamp(),
      })
      b.set(userDoc(db, targetUid), { orgIds: arrayUnion(orgId) }, { merge: true })
      await b.commit()
      setInviteEmail('')
      setSelectedMemberUid(null)
      setInviteRole('staff')
      setSuggestions([])
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Não foi possível adicionar o utilizador.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function approveRequest(orgId: string, row: AccessReqRow) {
    if (!user) return
    setInviteError(null)
    try {
      const memRef = doc(membersCol(db, orgId), row.requesterUid)
      const reqRef = doc(accessRequestsCol(db, orgId), row.id)
      const b = writeBatch(db)
      b.set(memRef, {
        role: 'staff',
        email: row.requesterEmail,
        memberUid: row.requesterUid,
        joinedAt: serverTimestamp(),
      })
      b.update(reqRef, {
        status: 'approved',
        resolvedByUid: user.uid,
        resolvedAt: serverTimestamp(),
      })
      b.set(userDoc(db, row.requesterUid), { orgIds: arrayUnion(orgId) }, { merge: true })
      await b.commit()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Não foi possível aprovar.')
    }
  }

  async function rejectRequest(orgId: string, row: AccessReqRow) {
    if (!user) return
    setInviteError(null)
    try {
      await updateDoc(doc(accessRequestsCol(db, orgId), row.id), {
        status: 'rejected',
        resolvedByUid: user.uid,
        resolvedAt: serverTimestamp(),
      })
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Não foi possível recusar.')
    }
  }

  function pickSuggestion(s: { uid: string; email: string }) {
    setInviteEmail(s.email)
    setSelectedMemberUid(s.uid)
    setSuggestions([])
  }

  useEffect(() => {
    setInviteEmail('')
    setSelectedMemberUid(null)
    setInviteError(null)
    setSuggestions([])
    setInviteRole('staff')
  }, [manageOrgId])

  function handleBack() {
    const state = location.state as OrgListNavState | undefined
    const from = state?.from
    const previousOrgId = state?.previousOrgId

    if (from && /^\/app(\/|$)/.test(from)) {
      if (previousOrgId) setOrgId(previousOrgId)
      navigate(from, { replace: false })
      return
    }
    if (from && from !== location.pathname) {
      navigate(from)
      return
    }
    navigate(-1)
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <PageTitle
        title="Organizações"
        subtitle="Escolha a empresa, adicione utilizadores à equipa ou peça acesso a outra."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" type="button" onClick={handleBack}>
              Voltar
            </Button>
            <Button variant="ghost" type="button" onClick={() => void logout().then(() => navigate('/login'))}>
              Sair
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          to="/orgs/pedir-acesso"
          className="inline-flex rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-950"
        >
          Pedir acesso a empresa
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {receivedInvites.length > 0 ? (
        <Card className="mb-6 border-violet-200 dark:border-violet-900">
          <h2 className="mb-3 text-sm font-semibold text-violet-900 dark:text-violet-100">Convites recebidos</h2>
          <ul className="space-y-3">
            {receivedInvites.map((inv) => (
              <li
                key={`${inv.orgId}-${inv.id}`}
                className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{inv.orgName}</p>
                  <p className="text-xs text-zinc-500">
                    Função: {roleLabel(inv.role)} · {inv.emailLower}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" className="text-xs py-1" onClick={() => void acceptInvite(inv)}>
                    Aceitar
                  </Button>
                  <Button type="button" variant="secondary" className="text-xs py-1" onClick={() => void declineInvite(inv)}>
                    Recusar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {loadingList ? (
        <p className="text-sm text-zinc-500">A carregar…</p>
      ) : orgIds.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Ainda não pertence a nenhuma empresa. Crie a primeira abaixo ou peça acesso a uma empresa existente.
        </p>
      ) : (
        <ul className="mb-6 space-y-2">
          {orgIds.map((id) => {
            const canManage = roles[id] === 'owner' || roles[id] === 'admin'
            const expanded = manageOrgId === id
            return (
              <li
                key={id}
                className="overflow-visible rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-zinc-900 hover:text-violet-700 dark:text-zinc-50 dark:hover:text-violet-300"
                    onClick={() => openOrg(id)}
                  >
                    {names[id] ?? id}
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="text-xs py-1" onClick={() => openOrg(id)}>
                      Abrir
                    </Button>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs py-1"
                        onClick={() => setManageOrgId(expanded ? null : id)}
                      >
                        {expanded ? 'Fechar gestão' : 'Adicionar utilizador / pedidos'}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {expanded && canManage ? (
                  <div className="relative z-10 overflow-visible border-t border-zinc-100 px-3 py-3 dark:border-zinc-800">
                    {inviteError ? <p className="mb-2 text-xs text-red-600">{inviteError}</p> : null}

                    {accessRequests.length > 0 ? (
                      <div className="mb-4">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pedidos de acesso</h3>
                        <ul className="space-y-2">
                          {accessRequests.map((r) => (
                            <li
                              key={r.id}
                              className="flex flex-col gap-2 rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <span className="text-xs text-zinc-800 dark:text-zinc-200">{r.requesterEmail}</span>
                              <div className="flex gap-2">
                                <Button type="button" className="text-xs py-1" onClick={() => void approveRequest(id, r)}>
                                  Aceitar
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  className="text-xs py-1"
                                  onClick={() => void rejectRequest(id, r)}
                                >
                                  Recusar
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Adicionar utilizador (conta já existente na app)
                    </h3>
                    <div className="space-y-2">
                      <Field label="Email do utilizador">
                        <div className="relative z-30">
                          <Input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => {
                              setInviteEmail(e.target.value)
                              setSelectedMemberUid(null)
                            }}
                            placeholder="Comece a escrever o email…"
                            autoComplete="off"
                          />
                          {suggestions.length > 0 ? (
                            <ul className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                              {suggestions.map((s) => (
                                <li key={s.uid}>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pickSuggestion(s)}
                                  >
                                    {s.email}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </Field>
                      <Field label="Função na empresa">
                        <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MemberRole)}>
                          <option value="staff">Equipa</option>
                          <option value="admin">Administrador</option>
                        </Select>
                      </Field>
                      <Button type="button" disabled={inviteBusy} onClick={() => void addMemberToOrg(id)}>
                        {inviteBusy ? 'A adicionar…' : 'Adicionar à empresa'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Nova empresa</h2>
        <form onSubmit={onCreate} className="space-y-3">
          <Field label="Nome da loja / empresa">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Aura Casa" />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'A criar…' : 'Criar e abrir'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
