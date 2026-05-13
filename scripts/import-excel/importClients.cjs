/**
 * Importa apenas a folha "Clientes" do Excel para Firestore.
 *
 * Uso:
 *   node importClients.cjs --credentials "C:\\path\\serviceAccountKey.json" --excel "..\\..\\Documents\\Aura Casa.xlsx" --org-id "ORG_ID"
 *
 * Ou defina GOOGLE_APPLICATION_CREDENTIALS e omita --credentials.
 */

const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const XLSX = require('xlsx')

function parseArgs(argv) {
  const out = { credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '', excel: '', orgId: '' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--credentials' && argv[i + 1]) {
      out.credentials = argv[++i]
    } else if (a === '--excel' && argv[i + 1]) {
      out.excel = argv[++i]
    } else if (a === '--org-id' && argv[i + 1]) {
      out.orgId = argv[++i]
    }
  }
  return out
}

function normIdPart(s) {
  const out = String(s || '')
    .trim()
    .replace(/[^\w\-]/g, '_')
  return out.slice(0, 200) || 'x'
}

function lettersOnlyLower(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

function parseMoney(val) {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  const s = String(val)
    .trim()
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function safeInt(val, def = 0) {
  if (val === null || val === undefined || val === '') return def
  const n = parseInt(String(val).replace(',', '.'), 10)
  return Number.isFinite(n) ? n : def
}

/** Linha com chaves já sem espaços nas etiquetas */
function stripKeys(row) {
  const o = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === '__rowNum__') continue
    o[String(k).trim()] = v
  }
  return o
}

function pick(norm, ...names) {
  for (const n of names) {
    const key = n.trim()
    if (Object.prototype.hasOwnProperty.call(norm, key) && norm[key] !== '' && norm[key] != null) {
      return norm[key]
    }
  }
  return undefined
}

function txt(norm, ...keys) {
  const v = pick(norm, ...keys)
  if (v === undefined || v === null) return ''
  const s = String(v).trim()
  if (!s || s.toLowerCase() === 'nan') return ''
  return s
}

function toFirestoreDate(val) {
  if (val === undefined || val === null || val === '') return null
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val
  if (typeof val === 'number' && Number.isFinite(val)) {
    const epoch = new Date((val - 25569) * 86400 * 1000)
    return Number.isNaN(epoch.getTime()) ? null : epoch
  }
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? null : d
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.credentials) {
    console.error(
      'Indique --credentials caminho\\serviceAccountKey.json ou defina GOOGLE_APPLICATION_CREDENTIALS.',
    )
    process.exit(1)
  }
  if (!args.excel || !args.orgId) {
    console.error('Uso: node importClients.cjs --credentials KEY.json --excel "..\\Aura Casa.xlsx" --org-id ORG_ID')
    process.exit(1)
  }

  const credPath = path.resolve(args.credentials)
  if (!fs.existsSync(credPath)) {
    console.error('Ficheiro de credenciais não encontrado:', credPath)
    process.exit(1)
  }

  const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'))

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }

  const db = admin.firestore()
  const excelPath = path.resolve(args.excel)
  if (!fs.existsSync(excelPath)) {
    console.error('Excel não encontrado:', excelPath)
    process.exit(1)
  }

  const wb = XLSX.readFile(excelPath, { cellDates: true, type: 'file' })
  if (!wb.SheetNames.includes('Clientes')) {
    console.error('A folha "Clientes" não existe neste ficheiro.')
    process.exit(1)
  }

  const sheet = wb.Sheets['Clientes']
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

  const orgRef = db.collection('organizations').doc(args.orgId)
  let saved = 0

  let batch = db.batch()
  let ops = 0

  for (const raw of rows) {
    const row = stripKeys(raw)
    const code = txt(row, 'Código', 'Codigo')
    const name = txt(row, 'Nome')
    if (!code && !name) continue
    if (lettersOnlyLower(code) === 'codigo' && lettersOnlyLower(name) === 'nome') continue

    const docId = normIdPart(code || name)
    const displayName = name || code
    const reg = toFirestoreDate(pick(row, 'Data Cadastro'))
    const last = toFirestoreDate(pick(row, 'Ultima compra', 'Última compra'))

    const payload = {
      code,
      name: displayName,
      phone: txt(row, 'Telefone'),
      city: txt(row, 'Cidade'),
      instagram: txt(row, 'Intagram', 'Instagram'),
      totalPurchased: parseMoney(pick(row, 'Total comprado')),
      purchaseCount: safeInt(pick(row, 'Quantidade')),
      avgTicket: parseMoney(pick(row, 'Ticket Médio', 'Ticket Medio')),
      notes: txt(row, 'Observações', 'Observacoes'),
    }
    if (reg) payload.registeredAt = admin.firestore.Timestamp.fromDate(reg)
    if (last) payload.lastPurchaseAt = admin.firestore.Timestamp.fromDate(last)

    const ref = orgRef.collection('clients').doc(docId)
    batch.set(ref, payload, { merge: true })
    ops++
    saved++

    if (ops >= 450) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }

  if (ops > 0) await batch.commit()

  console.log(`Clientes: ${saved} linhas gravadas em organizations/${args.orgId}/clients`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
