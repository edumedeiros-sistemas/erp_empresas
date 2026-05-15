/** Email em minúsculas e sem espaços (para convites e índice). */
export function normalizeEmail(email: string): string {
  return String(email ?? '')
    .trim()
    .toLowerCase()
}
