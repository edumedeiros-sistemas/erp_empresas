/** Normaliza texto para comparação em filtros de listagem (sem acentos extras). */
export function normalizeSearch(s: string) {
  return s.trim().toLowerCase()
}

/** Verdadeiro se a query está vazia ou algum campo contém a query. */
export function textMatches(query: string, ...parts: (string | null | undefined)[]) {
  const q = normalizeSearch(query)
  if (!q) return true
  return parts.some((p) => normalizeSearch(String(p ?? '')).includes(q))
}
