/** Itens da NF-e (modelo 55) extraídos do XML autorizado. */

export interface NFeItemLine {
  nItem: number
  cProd: string
  xProd: string
  uCom: string
  qCom: number
  vUnCom: number
  vProd: number
  /** Valor total de IPI da linha (det/imposto/IPI/.../vIPI). */
  vIPI: number
}

export interface NFeDuplicata {
  /** Número da duplicata (ex.: 001, 002). */
  nDup: string
  /** Data de vencimento (AAAA-MM-DD). */
  dVenc: string
  /** Valor da parcela. */
  vDup: number
}

export interface NFeParsed {
  chave?: string
  nNF?: string
  serie?: string
  dhEmi?: string
  /** Pedido de compra (infNFe/compra/xPed ou xPed no primeiro item). */
  xPed?: string
  /** Nome do emitente (fornecedor) — razão social (`emit/xNome`). */
  emitenteNome?: string
  /** Razão social (mesmo que `xNome` no XML). */
  emitRazaoSocial?: string
  /** Nome fantasia (`emit/xFant`). */
  emitFantasia?: string
  /** CNPJ do emitente (apenas dígitos). */
  emitCnpj?: string
  /** CPF do emitente (apenas dígitos), quando pessoa física. */
  emitCpf?: string
  /** Inscrição estadual (`emit/IE`). */
  emitIE?: string
  /** Total da NF-e (ICMSTot/vNF). */
  vNF?: number
  /** Total de frete na NF-e (ICMSTot/vFrete). */
  vFrete?: number
  /** Parcelas em infNFe/cobr/dup (quando a compra foi faturada a prazo). */
  duplicatas?: NFeDuplicata[]
  items: NFeItemLine[]
}

function textChild(parent: Element, local: string): string {
  for (const ch of Array.from(parent.children)) {
    if (ch.localName === local) return ch.textContent?.trim() ?? ''
  }
  return ''
}

/** NF-e em XML: decimal com ponto (padrão XSD); aceita também vírgula decimal e milhares (ex.: 1.234,56). */
function parseXmlDecimal(s: string): number {
  if (!s) return 0
  let t = String(s).trim().replace(/\s/g, '')
  if (!t) return 0
  const br = t.match(/^([\d.]+),(\d+)$/)
  if (br && t.includes(',')) {
    const intPart = br[1]!.replace(/\./g, '')
    const decPart = br[2]!
    if (/^\d+$/.test(intPart) && /^\d+$/.test(decPart)) {
      const n = parseFloat(`${intPart}.${decPart}`)
      return Number.isFinite(n) ? n : 0
    }
  }
  t = t.replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

/** IPI total da linha (det/imposto/IPI). */
function ipiFromDet(det: Element): number {
  const imposto = [...det.children].find((c) => c.localName === 'imposto')
  if (!imposto) return 0

  const ipiRoot = [...imposto.children].find((c) => c.localName === 'IPI')
  if (!ipiRoot) return 0

  for (const block of [...ipiRoot.children]) {
    if (block.localName !== 'IPITrib' && block.localName !== 'IPINT') continue
    const vIPI = parseXmlDecimal(textChild(block, 'vIPI'))
    if (vIPI > 0) return vIPI
    const vBC = parseXmlDecimal(textChild(block, 'vBC'))
    const pIPI = parseXmlDecimal(textChild(block, 'pIPI'))
    if (vBC > 0 && pIPI > 0) {
      return Math.round(((vBC * pIPI) / 100) * 100) / 100
    }
  }

  for (const el of [...ipiRoot.getElementsByTagName('*')]) {
    if (el.localName === 'vIPI') {
      const v = parseXmlDecimal(el.textContent ?? '')
      if (v > 0) return v
    }
  }
  return 0
}

/** Tamanho comum na descrição (vestuário). */
export function guessSizeFromDescription(desc: string): string | null {
  const m = String(desc).match(/\b(GG|XG|G|M|P|PP|U)\b/i)
  return m ? m[1]!.toUpperCase() : null
}

/** Parcelas a partir de `pag/detPag` (alguns emitentes não repetem `cobr/dup`). */
function collectDuplicatasFromPag(infNfe: Element): NFeDuplicata[] {
  const out: NFeDuplicata[] = []
  const pag = [...infNfe.getElementsByTagName('*')].find((e) => e.localName === 'pag')
  if (!pag) return out
  const detPags = [...pag.getElementsByTagName('*')].filter((e) => e.localName === 'detPag')
  let seq = 0
  for (const ch of detPags) {
    const vPag = parseXmlDecimal(textChild(ch, 'vPag'))
    if (vPag <= 0) continue
    seq++
    const dhPag = textChild(ch, 'dhPag').trim()
    const dVenc =
      textChild(ch, 'dVenc').trim() ||
      textChild(ch, 'dPag').trim() ||
      (dhPag.length >= 10 ? dhPag.slice(0, 10) : '')
    const nDupRaw = textChild(ch, 'nDup').trim()
    const nDup = nDupRaw || String(seq).padStart(3, '0')
    out.push({ nDup, dVenc, vDup: vPag })
  }
  return out
}

/**
 * Extrai `<dup>` do texto do bloco `<cobr>` quando o DOM já devolveu zero duplicatas.
 * Cobre XML minificado ou cópias onde o leitor em árvore falhe; se o ficheiro não contiver `<dup>`, continua vazio.
 */
function collectDuplicatasFromCobrRawXml(xmlString: string): NFeDuplicata[] {
  const out: NFeDuplicata[] = []
  const cobrM = xmlString.match(/<cobr\b[^>]*>([\s\S]*?)<\/cobr>/i)
  if (!cobrM) return out
  const inner = cobrM[1] ?? ''
  const tagText = (block: string, tag: string): string => {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
    const m = block.match(re)
    if (!m) return ''
    return m[1]!.replace(/<[^>]*>/g, '').trim()
  }
  const dupRe = /<dup\b[^>]*>[\s\S]*?<\/dup>/gi
  let m: RegExpExecArray | null
  while ((m = dupRe.exec(inner)) !== null) {
    const block = m[0]
    const nDup = tagText(block, 'nDup')
    const dVenc = tagText(block, 'dVenc')
    const vDup = parseXmlDecimal(tagText(block, 'vDup'))
    if (vDup > 0) {
      out.push({
        nDup: nDup || String(out.length + 1),
        dVenc,
        vDup,
      })
    }
  }
  return out
}

/** Número do pedido em texto livre `infCpl` (ex.: `PEDIDO: 07061575|...`). */
function extractPedidoFromInfCpl(infNfe: Element): string {
  const infAdic = [...infNfe.children].find((c) => c.localName === 'infAdic')
  if (!infAdic) return ''
  const cpl = textChild(infAdic, 'infCpl')
  const m = cpl.match(/PEDIDO:\s*([^|]+)/i)
  return m ? m[1]!.trim() : ''
}

export function parseNFeXml(xmlString: string): NFeParsed {
  const parser = new DOMParser()
  const xml = parser.parseFromString(xmlString, 'application/xml')
  const err = xml.querySelector('parsererror')
  if (err) throw new Error('Ficheiro XML inválido ou corrompido.')

  let chave: string | undefined
  const infNfeList = [...xml.getElementsByTagName('*')].filter((e) => e.localName === 'infNFe')
  const infNfe = infNfeList[0]
  if (infNfe) {
    const id = infNfe.getAttribute('Id') ?? ''
    chave = id.replace(/^NFe/i, '').trim() || undefined
  }
  if (!chave) {
    const ch = [...xml.getElementsByTagName('*')].find((e) => e.localName === 'chNFe')
    if (ch?.textContent) chave = ch.textContent.trim()
  }

  let nNF = ''
  let serie = ''
  let dhEmi = ''
  let xPedDoc = ''
  let emitFantasia = ''
  let emitRazaoSocial = ''
  let emitCnpjDigits = ''
  let emitCpfDigits = ''
  let emitIE = ''
  let vNF = 0
  let vFrete = 0
  const ide = [...xml.getElementsByTagName('*')].find((e) => e.localName === 'ide')
  if (ide) {
    nNF = textChild(ide, 'nNF')
    serie = textChild(ide, 'serie')
    dhEmi = textChild(ide, 'dhEmi')
  }

  if (infNfe) {
    const emit = [...infNfe.children].find((c) => c.localName === 'emit')
    if (emit) {
      emitRazaoSocial = textChild(emit, 'xNome')
      emitFantasia = textChild(emit, 'xFant')
      emitIE = textChild(emit, 'IE')
      emitCnpjDigits = textChild(emit, 'CNPJ').replace(/\D/g, '')
      emitCpfDigits = textChild(emit, 'CPF').replace(/\D/g, '')
    }
    const compra = [...infNfe.children].find((c) => c.localName === 'compra')
    if (compra) xPedDoc = textChild(compra, 'xPed')
    const totalEl = [...infNfe.children].find((c) => c.localName === 'total')
    if (totalEl) {
      const icmsTot = [...totalEl.children].find((c) => c.localName === 'ICMSTot')
      if (icmsTot) {
        vNF = parseXmlDecimal(textChild(icmsTot, 'vNF'))
        vFrete = parseXmlDecimal(textChild(icmsTot, 'vFrete'))
      }
    }
  }

  const duplicatas: NFeDuplicata[] = []
  if (infNfe) {
    const dupNodes = [...infNfe.getElementsByTagName('*')].filter((e) => e.localName === 'dup')
    for (const ch of dupNodes) {
      const nDup = textChild(ch, 'nDup')
      const dVenc = textChild(ch, 'dVenc')
      const vDup = parseXmlDecimal(textChild(ch, 'vDup'))
      if (vDup > 0) {
        duplicatas.push({
          nDup: nDup || String(duplicatas.length + 1),
          dVenc: dVenc.trim(),
          vDup,
        })
      }
    }
    if (duplicatas.length === 0) {
      const fromPag = collectDuplicatasFromPag(infNfe)
      for (const p of fromPag) duplicatas.push(p)
    }
    if (duplicatas.length === 0) {
      const fromRaw = collectDuplicatasFromCobrRawXml(xmlString)
      for (const p of fromRaw) duplicatas.push(p)
    }
  }

  const dets = [...xml.getElementsByTagName('*')].filter((e) => e.localName === 'det')
  const items: NFeItemLine[] = []

  for (const det of dets) {
    const nItem = parseInt(det.getAttribute('nItem') ?? '0', 10) || items.length + 1
    const prod = [...det.children].find((c) => c.localName === 'prod')
    if (!prod) continue
    const cProd = textChild(prod, 'cProd')
    const xProd = textChild(prod, 'xProd')
    const uCom = textChild(prod, 'uCom')
    const qRaw = textChild(prod, 'qCom')
    const vuRaw = textChild(prod, 'vUnCom')
    const vpRaw = textChild(prod, 'vProd')
    const xPedItem = textChild(prod, 'xPed')
    const qCom = parseXmlDecimal(qRaw)
    const vUnCom = parseXmlDecimal(vuRaw)
    const vProd = parseXmlDecimal(vpRaw) || qCom * vUnCom
    if (!cProd && !xProd) continue
    if (!xPedDoc.trim() && xPedItem.trim()) xPedDoc = xPedItem.trim()
    const vIPI = ipiFromDet(det)
    items.push({
      nItem,
      cProd: cProd.trim(),
      xProd: xProd.trim(),
      uCom: uCom.trim() || 'UN',
      qCom: qCom > 0 ? qCom : 0,
      vUnCom,
      vProd,
      vIPI,
    })
  }

  if (items.length === 0) {
    throw new Error(
      'Nenhum item de produto (det/prod) encontrado no XML. Envie o XML da NF-e autorizada (ex.: nfeProc).',
    )
  }

  if (!xPedDoc.trim() && infNfe) {
    const fromCpl = extractPedidoFromInfCpl(infNfe)
    if (fromCpl) xPedDoc = fromCpl
  }

  return {
    chave,
    nNF: nNF || undefined,
    serie: serie || undefined,
    dhEmi: dhEmi || undefined,
    xPed: xPedDoc.trim() || undefined,
    emitenteNome: emitRazaoSocial.trim() || undefined,
    emitRazaoSocial: emitRazaoSocial.trim() || undefined,
    emitFantasia: emitFantasia.trim() || undefined,
    emitCnpj: emitCnpjDigits.length === 14 ? emitCnpjDigits : undefined,
    emitCpf: emitCpfDigits.length === 11 ? emitCpfDigits : undefined,
    emitIE: emitIE.trim() || undefined,
    vNF: vNF > 0 ? vNF : undefined,
    vFrete: vFrete > 0 ? vFrete : undefined,
    duplicatas: duplicatas.length > 0 ? duplicatas : undefined,
    items,
  }
}
