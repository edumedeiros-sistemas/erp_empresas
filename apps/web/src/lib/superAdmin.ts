import type { User } from 'firebase/auth'
import { normalizeEmail } from '@/lib/emailNormalize'

/** Email do administrador global (regras Firestore devem incluir o mesmo valor). */
export const SUPER_ADMIN_EMAIL_DEFAULT = 'edu.netto.smedeiros@hotmail.com'

/** Emails em minúsculas: o default entra sempre; VITE_SUPER_ADMIN_EMAIL pode listar vários separados por vírgula. */
const SUPER_ADMIN_ALLOWLIST_LOWER: ReadonlySet<string> = (() => {
  const set = new Set<string>()
  set.add(normalizeEmail(SUPER_ADMIN_EMAIL_DEFAULT))
  const raw = String(import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? '')
  for (const part of raw.split(',')) {
    const e = normalizeEmail(part)
    if (e) set.add(e)
  }
  return set
})()

export function superAdminEmailLower(): string {
  return normalizeEmail(SUPER_ADMIN_EMAIL_DEFAULT)
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return SUPER_ADMIN_ALLOWLIST_LOWER.has(normalizeEmail(email))
}

/** Usa `user.email` e emails em `providerData` (útil com login social). */
export function isSuperAdminUser(user: User | null | undefined): boolean {
  if (!user) return false
  if (isSuperAdminEmail(user.email)) return true
  for (const p of user.providerData ?? []) {
    if (isSuperAdminEmail(p.email)) return true
  }
  return false
}
