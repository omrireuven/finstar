import type { Transaction, RecurringCharge } from '../types';

/**
 * Heuristic matcher to recommend links between newly scraped transactions and active recurring charges.
 * Evaluates close amounts (±15% or within 10 ILS), date proximity (within 7 days of expected billing day of that month),
 * and name/category similarity. Only matches virtual occurrences that are on or before today.
 */
export function getLocalLinkRecommendations(
  newExpenses: Transaction[],
  recurringCharges: RecurringCharge[],
  allTransactions: Transaction[]
): { transactionId: string; recurringId: string; reason: string }[] {
  const recommendations: { transactionId: string; recurringId: string; reason: string }[] = [];
  const activeRecurring = recurringCharges.filter(r => r.active);
  const today = new Date();

  for (const t of newExpenses) {
    // If the transaction is already linked or is virtual, skip
    if (t.recurringId || t.isVirtual) continue;

    let bestMatch: { recurringId: string; reason: string; priority: number } | null = null;

    for (const r of activeRecurring) {
      // 1. Amount match: within 15% OR within 10 ILS
      const amountDiff = Math.abs(t.amount - r.amount);
      const isAmountClose = (amountDiff / r.amount <= 0.15) || amountDiff <= 10;
      if (!isAmountClose) continue;

      // 2. Date check: transaction date within 7 days of the billing day of that month
      const tDate = new Date(t.date);
      // Ensure the transaction occurrence is not in the future
      if (tDate > today) continue;

      const tYear = tDate.getFullYear();
      const tMonth = tDate.getMonth(); // 0-11
      
      // Target billing date in the transaction's month
      const maxDay = new Date(tYear, tMonth + 1, 0).getDate();
      const billingDay = Math.min(r.dayOfMonth, maxDay);
      const billingDate = new Date(tYear, tMonth, billingDay);
      
      const dayDiffMs = Math.abs(tDate.getTime() - billingDate.getTime());
      const dayDiff = dayDiffMs / (24 * 60 * 60 * 1000);
      if (dayDiff > 7) continue;

      // 3. Name & Category match
      const tNameClean = t.business.toLowerCase().trim();
      const rNameClean = r.name.toLowerCase().trim();
      
      const isExactName = tNameClean === rNameClean;
      const isSubstring = tNameClean.includes(rNameClean) || rNameClean.includes(tNameClean);
      const isCategoryMatch = t.category === r.category;

      let priority = 0;
      let reason = '';

      if (isExactName) {
        priority = 3;
        reason = `התאמה מדויקת בשם העסק וסכום קרוב (סטייה של ${Math.round(amountDiff)} ₪)`;
      } else if (isSubstring) {
        priority = 2;
        reason = `שם עסק דומה ("${r.name}") וסכום קרוב`;
      } else if (isCategoryMatch) {
        priority = 1;
        reason = `קטגוריה זהה ("${r.category}"), סכום קרוב וסמיכות תאריכים`;
      } else {
        continue; // no name or category match
      }

      if (!bestMatch || priority > bestMatch.priority) {
        bestMatch = { recurringId: r.id, reason, priority };
      }
    }

    if (bestMatch) {
      recommendations.push({
        transactionId: t.id,
        recurringId: bestMatch.recurringId,
        reason: bestMatch.reason
      });
    }
  }

  return recommendations;
}
