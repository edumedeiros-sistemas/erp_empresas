/** Empresa ativa no browser (sobrevive ao F5 na mesma origem). */
export const ACTIVE_ORG_STORAGE_KEY = 'aura_casa_active_org'

export function readStoredActiveOrgId(): string | null {
  try {
    const id = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
    return id?.trim() ? id.trim() : null
  } catch {
    return null
  }
}

export function writeStoredActiveOrgId(orgId: string | null): void {
  try {
    if (orgId) localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId)
    else localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
