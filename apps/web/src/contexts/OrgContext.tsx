import { db } from '@/firebase'
import { defaultOrgSettings, emptyDashboardStats } from '@/lib/defaults'
import {
  filterExistingOrgIds,
  listMembershipOrgIdsForUser,
  verifyMembershipOrgIds,
} from '@/lib/orgMembershipSync'
import {
  dashboardDoc,
  membersCol,
  orgDirectoryDoc,
  orgDoc,
  settingsDoc,
  userDoc,
} from '@/lib/firestorePaths'
import type { Organization } from '@/types'
import { readStoredActiveOrgId, writeStoredActiveOrgId } from '@/lib/activeOrgStorage'
import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'

interface OrgValue {
  orgId: string | null
  organization: Organization | null
  orgIds: string[]
  setOrgId: (id: string | null) => void
  refreshOrgs: () => Promise<void>
  createOrganization: (name: string) => Promise<string>
  loadingList: boolean
  /** A validar empresa guardada no browser após F5 (antes de redirecionar a /orgs). */
  restoringOrg: boolean
}

const OrgContext = createContext<OrgValue | null>(null)

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [orgId, setOrgIdState] = useState<string | null>(() => readStoredActiveOrgId())
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [orgIds, setOrgIds] = useState<string[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [restoringOrg, setRestoringOrg] = useState(() => !!readStoredActiveOrgId())

  const refreshOrgs = useCallback(async () => {
    if (!user) {
      setOrgIds([])
      return
    }
    setLoadingList(true)
    const fromMembers = await listMembershipOrgIdsForUser(user.uid)
    const uref = userDoc(db, user.uid)
    const usnap = await getDoc(uref)
    const legacy: string[] = usnap.exists() ? ((usnap.data().orgIds as string[]) ?? []).filter(Boolean) : []
    const merged = [...new Set([...fromMembers, ...legacy])]
    const withMemberDoc = await verifyMembershipOrgIds(user.uid, merged)
    const ids = await filterExistingOrgIds(withMemberDoc)
    if (usnap.exists() && ids.length !== merged.length) {
      try {
        await updateDoc(uref, { orgIds: ids })
      } catch {
        /* limpar orgIds fantasma no perfil */
      }
    } else {
      const missingInProfile = fromMembers.filter((id) => !legacy.includes(id) && ids.includes(id))
      if (missingInProfile.length > 0) {
        try {
          await updateDoc(uref, { orgIds: arrayUnion(...missingInProfile) })
        } catch {
          /* perfil users pode falhar; a lista já vem de members. */
        }
      }
    }
    setOrgIds(ids)
    setLoadingList(false)
  }, [user])

  useEffect(() => {
    if (authLoading) {
      setLoadingList(true)
      return
    }
    if (!user) {
      setOrgIds([])
      setLoadingList(false)
      return
    }
    void refreshOrgs()
  }, [refreshOrgs, authLoading, user])

  const setOrgId = useCallback(
    (id: string | null) => {
      setOrgIdState(id)
      writeStoredActiveOrgId(id)
      if (user?.uid) {
        void updateDoc(userDoc(db, user.uid), {
          activeOrgId: id ? id : deleteField(),
        }).catch(() => {
          /* perfil opcional */
        })
      }
    },
    [user],
  )

  /** Restaura empresa ativa do browser ou do perfil (users.activeOrgId) após auth + lista. */
  useEffect(() => {
    if (authLoading || loadingList || !user) return
    if (orgId) return

    const stored = readStoredActiveOrgId()
    if (stored && orgIds.includes(stored)) {
      setOrgIdState(stored)
      setRestoringOrg(false)
      return
    }

    let cancelled = false
    setRestoringOrg(true)
    void (async () => {
      try {
        const usnap = await getDoc(userDoc(db, user.uid))
        if (cancelled) return
        const fromProfile = String((usnap.data()?.activeOrgId as string) ?? '').trim()
        if (fromProfile && orgIds.includes(fromProfile)) {
          setOrgIdState(fromProfile)
          writeStoredActiveOrgId(fromProfile)
          setRestoringOrg(false)
        } else {
          setRestoringOrg(false)
        }
      } catch {
        if (!cancelled) setRestoringOrg(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, loadingList, user, orgId, orgIds])

  /** Após F5: confirma members/{uid} da empresa guardada antes de limpar ou mandar para /orgs. */
  useEffect(() => {
    if (authLoading || loadingList || !user) {
      if (!orgId) setRestoringOrg(false)
      return
    }
    if (!orgId) {
      setRestoringOrg(false)
      return
    }
    if (orgIds.includes(orgId)) {
      setRestoringOrg(false)
      return
    }

    let cancelled = false
    setRestoringOrg(true)
    void (async () => {
      try {
        const orgSnap = await getDoc(orgDoc(db, orgId))
        if (cancelled) return
        if (!orgSnap.exists()) {
          setOrgId(null)
          setRestoringOrg(false)
          return
        }
        const memSnap = await getDoc(doc(membersCol(db, orgId), user.uid))
        if (cancelled) return
        if (memSnap.exists()) {
          setOrgIds((prev) => (prev.includes(orgId) ? prev : [...prev, orgId]))
          setRestoringOrg(false)
          return
        }
        setOrgId(null)
        setRestoringOrg(false)
      } catch {
        if (!cancelled) setRestoringOrg(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, loadingList, orgId, orgIds, user, setOrgId])

  useEffect(() => {
    if (!orgId) {
      setOrganization(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(orgDoc(db, orgId))
      if (cancelled) return
      if (!snap.exists()) {
        setOrganization(null)
        return
      }
      setOrganization({
        id: snap.id,
        name: (snap.data().name as string) ?? '',
        createdAt: snap.data().createdAt,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const createOrganization = useCallback(
    async (name: string) => {
      if (!user) throw new Error('Autenticação necessária')
      const orgsCol = collection(db, 'organizations')
      const newOrgRef = doc(orgsCol)
      const oid = newOrgRef.id

      await setDoc(newOrgRef, {
        name: name.trim(),
        createdAt: serverTimestamp(),
      })

      await setDoc(doc(membersCol(db, oid), user.uid), {
        role: 'owner',
        email: user.email ?? null,
        memberUid: user.uid,
        joinedAt: serverTimestamp(),
      })

      await setDoc(orgDirectoryDoc(db, oid), {
        name: name.trim(),
        updatedAt: serverTimestamp(),
      })

      await setDoc(settingsDoc(db, oid), defaultOrgSettings())
      await setDoc(dashboardDoc(db, oid), emptyDashboardStats())

      await updateDoc(userDoc(db, user.uid), {
        orgIds: arrayUnion(oid),
      })

      await refreshOrgs()
      setOrgId(oid)
      return oid
    },
    [user, refreshOrgs, setOrgId],
  )

  const value = useMemo(
    () => ({
      orgId,
      organization,
      orgIds,
      setOrgId,
      refreshOrgs,
      createOrganization,
      loadingList,
      restoringOrg,
    }),
    [
      orgId,
      organization,
      orgIds,
      setOrgId,
      refreshOrgs,
      createOrganization,
      loadingList,
      restoringOrg,
    ],
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
