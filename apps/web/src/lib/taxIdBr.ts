/** Remove tudo que não for dígito (CNPJ/CPF). */
export function digitsOnlyTaxId(value: string): string {
  return String(value ?? '').replace(/\D/g, '')
}

/** Máscara visual para CNPJ (14) ou CPF (11); caso contrário devolve só dígitos. */
export function formatBrazilTaxIdForDisplay(digits: string): string {
  const d = digitsOnlyTaxId(digits)
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d
}
