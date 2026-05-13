/**
 * Limpa dados ligados à importação de NF-e (e opcionalmente mais) numa organização,
 * para poder voltar a importar a mesma nota (contas a pagar / pré-cadastros / movimentos NF-e).
 *
 * O que faz sempre:
 *  - Agrupa movimentos stock com type === "nfe_in", desconta as quantidades do stock dos produtos,
 *    apaga esses movimentos.
 *  - Apaga todos os documentos em payables.
 *  - Apaga todos os documentos em productDrafts e supplierDrafts.
 *
 * Com --full também apaga:
 *  - receivables, financialTransactions
 *  - todos os stockMovements restantes (ex.: entrada manual) sem ajustar stock
 *  - todas as vendas e subcoleção items (sem reverter stock do cliente — use só em ambiente de teste)
 *
 * Uso:
 *   cd scripts/clear-org && npm install
 *   node clearForImportTest.cjs --org-id "SoV0wQB8gmx3xo8IYVcG" --credentials "C:\\caminho\\serviceAccount.json"
 *
 * Ou: GOOGLE_APPLICATION_CREDENTIALS apontando para a chave de serviço.
 */

const admin = require('firebase-admin')

function parseArgs(argv) {
  const out = {
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    orgId: '',
    full: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--credentials' && argv[i + 1]) out.credentials = argv[++i]
    else if (a === '--org-id' && argv[i + 1]) out.orgId = argv[++i]
    else if (a === '--full') out.full = true
  }
  return out
}

async function deleteInBatches(db, colRef, label) {
  const page = 400
  let total = 0
  while (true) {
    const snap = await colRef.limit(page).get()
    if (snap.empty) break
    const batch = db.batch()
    for (const d of snap.docs) batch.delete(d.ref)
    await batch.commit()
    total += snap.size
  }
  if (total > 0) console.log(`  ${label}: removidos ${total} documento(s).`)
  else console.log(`  ${label}: já estava vazio.`)
}

async function main() {
  const { credentials, orgId, full } = parseArgs(process.argv)
  if (!orgId) {
    console.error('Obrigatório: --org-id ID_DA_ORGANIZACAO')
    console.error('Opcional: --credentials caminho.json | variável GOOGLE_APPLICATION_CREDENTIALS')
    console.error('Opcional: --full  (apaga também vendas, financeiro, recebíveis e restantes movimentos)')
    process.exit(1)
  }

  if (credentials) {
    admin.initializeApp({ credential: admin.credential.cert(require(require('path').resolve(credentials))) })
  } else {
    admin.initializeApp()
  }

  const db = admin.firestore()
  const FieldValue = admin.firestore.FieldValue
  const orgRef = db.collection('organizations').doc(orgId)

  const orgSnap = await orgRef.get()
  if (!orgSnap.exists) {
    console.error('Organização não encontrada:', orgId)
    process.exit(1)
  }
  console.log('Organização:', orgSnap.data()?.name || orgId)

  console.log('\n1) Reverter stock das entradas NF-e (type nfe_in) e apagar esses movimentos...')
  const nfeSnap = await orgRef.collection('stockMovements').where('type', '==', 'nfe_in').get()
  const qtyByProduct = new Map()
  for (const d of nfeSnap.docs) {
    const x = d.data()
    const q = Number(x.quantity ?? 0)
    const pid = String(x.productId ?? '')
    if (!pid || q <= 0) continue
    qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + q)
  }
  for (const [pid, total] of qtyByProduct) {
    try {
      await orgRef.collection('products').doc(pid).update({ stock: FieldValue.increment(-total) })
      console.log(`  Produto ${pid.slice(0, 8)}… stock −=${total}`)
    } catch (e) {
      console.warn(`  Aviso: não foi possível atualizar stock do produto ${pid}:`, e.message)
    }
  }
  let batch = db.batch()
  let c = 0
  for (const d of nfeSnap.docs) {
    batch.delete(d.ref)
    c++
    if (c >= 450) {
      await batch.commit()
      batch = db.batch()
      c = 0
    }
  }
  if (c > 0) await batch.commit()
  console.log(`  Movimentos nfe_in apagados: ${nfeSnap.size}`)

  console.log('\n2) Apagar contas a pagar (payables)...')
  await deleteInBatches(db, orgRef.collection('payables'), 'payables')

  console.log('\n3) Apagar pré-cadastros NF-e (productDrafts)...')
  await deleteInBatches(db, orgRef.collection('productDrafts'), 'productDrafts')

  console.log('\n4) Apagar pré-cadastros de fornecedor (supplierDrafts)...')
  await deleteInBatches(db, orgRef.collection('supplierDrafts'), 'supplierDrafts')

  if (full) {
    console.log('\n[--full] Apagar recebíveis...')
    await deleteInBatches(db, orgRef.collection('receivables'), 'receivables')

    console.log('\n[--full] Apagar lançamentos financeiros...')
    await deleteInBatches(db, orgRef.collection('financialTransactions'), 'financialTransactions')

    console.log('\n[--full] Apagar movimentos de stock restantes...')
    await deleteInBatches(db, orgRef.collection('stockMovements'), 'stockMovements (resto)')

    console.log('\n[--full] Apagar vendas (items + venda)...')
    const salesSnap = await orgRef.collection('sales').get()
    let saleCount = 0
    for (const saleDoc of salesSnap.docs) {
      const itemsSnap = await saleDoc.ref.collection('items').get()
      let b = db.batch()
      let n = 0
      for (const it of itemsSnap.docs) {
        b.delete(it.ref)
        n++
        if (n >= 450) {
          await b.commit()
          b = db.batch()
          n = 0
        }
      }
      if (n > 0) await b.commit()
      await saleDoc.ref.delete()
      saleCount++
    }
    console.log(`  Vendas removidas: ${saleCount}`)
  }

  console.log('\nFeito. Pode voltar a importar o XML da NF-e.')
  if (!full) {
    console.log('Nota: custo/frete nos produtos não são revertidos automaticamente; só stock e registos acima.')
    console.log('Para limpar também vendas/financeiro/movimentos manuais, use --full (só em teste).')
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
