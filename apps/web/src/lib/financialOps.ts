import { db } from '@/firebase'
import { dashboardDoc } from '@/lib/firestorePaths'
import type { FinancialType } from '@/types'
import { runTransaction, serverTimestamp } from 'firebase/firestore'

export async function applyFinancialDelta(
  orgId: string,
  type: FinancialType,
  amount: number,
  sign: 1 | -1,
) {
  const delta = Math.abs(amount) * sign
  await runTransaction(db, async (transaction) => {
    const ref = dashboardDoc(db, orgId)
    const snap = await transaction.get(ref)
    const d = snap.exists() ? (snap.data() as Record<string, unknown>) : {}
    let financialIn = Number(d.financialIn ?? 0)
    let financialOut = Number(d.financialOut ?? 0)
    if (type === 'entrada') financialIn += delta
    else financialOut += delta
    transaction.set(
      ref,
      {
        financialIn: Math.max(0, financialIn),
        financialOut: Math.max(0, financialOut),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}
