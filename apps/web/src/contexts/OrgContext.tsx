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
import { arrayUnion, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
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
}

const OrgContext = createContext<OrgValue | null>(null)

const STORAGE_KEY = 'aura_casa_active_org'

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [orgId, setOrgIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [orgIds, setOrgIds] = useState<string[]>([])
  const [loadingList, setLoadingList] = useState(true)

  const refreshOrgs = useCallback(async () => {
    if (!user) {
      setOrgIds([])
      setLoadingList(false)
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
    void refreshOrgs()
  }, [refreshOrgs])

  const setOrgId = useCallback((id: string | null) => {
    setOrgIdState(id)
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!loadingList && orgId && !orgIds.includes(orgId)) {
      setOrgId(null)
    }
  }, [loadingList, orgId, orgIds, setOrgId])

  useEffect(() => {
    if (!orgId || loadingList) return
    let cancelled = false
    void (async () => {
      const snap = await getDoc(orgDoc(db, orgId))
      if (cancelled) return
      if (!snap.exists()) setOrgId(null)
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, loadingList, setOrgId])

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
    }),
    [
      orgId,
      organization,
      orgIds,
      setOrgId,
      refreshOrgs,
      createOrganization,
      loadingList,
    ],
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
