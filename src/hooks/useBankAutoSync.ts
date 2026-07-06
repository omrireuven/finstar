/**
 * Hook that manages automated daily synchronization of bank/credit card accounts.
 * Checks once an hour (or on application load) if a sync is due today.
 * If due, runs the scraper backend.
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useSettings } from '../store/settingsStore';
import { scrapeBank, mapScrapedTransactions, getErrorMessage } from '../lib/bankScraper';
import { llmAnalyzeNewTransactions } from '../utils/llmCategorizer';
import { getLocalLinkRecommendations } from '../utils/syncHelpers';
import { useSyncProgress } from '../store/syncProgressStore';
import type { SyncLog, Transaction } from '../types';

export function useBankAutoSync() {
  const { addTransactions, addIncomes, categoryRules, categoryRulesMeta, recurring, categories, aiRecommendations, setAiRecommendations, transactions, income, ignoredIdentifiers, addIgnoredIdentifier, deleteTransactions, setCategoryRule } = useStore();
  const { bankAccounts, updateBankAccount, autoSyncIntervalMinutes, autoSyncDaysBack, telegramBotToken, telegramChatId } = useSettings();
  const syncingInProgress = useRef(false);
  const { startSync, updateStep, finishSync } = useSyncProgress();

  async function checkAndSync() {
    if (bankAccounts.length === 0 || syncingInProgress.current) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const accountsToSync = bankAccounts.filter((acc) => {
      // Sync is due if lastSync is missing or not today
      return !acc.lastSync || acc.lastSync.slice(0, 10) !== todayStr;
    });

    if (accountsToSync.length === 0) return;

    syncingInProgress.current = true;
    console.log(`[AutoSync] Found ${accountsToSync.length} accounts to sync today...`);
    const newlyImportedExpenses: Transaction[] = [];
    const newlyImportedIncomes: import('../types').IncomeEntry[] = [];

    // Initialize progress steps
    const steps = [
      ...accountsToSync.map(acc => ({ id: acc.id, label: `סנכרון ${acc.nickname}` })),
      { id: 'ai', label: 'ניתוח חכם (AI)' },
      { id: 'db', label: 'שמירת נתונים' }
    ];
    startSync(steps);

    for (const account of accountsToSync) {
      updateStep(account.id, { status: 'active', tooltip: 'מתחבר לבנק/אשראי...' });
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (autoSyncDaysBack || 30));

        const result = await scrapeBank(
          account.companyId,
          account.credentials,
          startDate.toISOString().slice(0, 10)
        );

        const log: SyncLog = {
          date: new Date().toISOString(),
          status: result.success ? 'success' : 'error',
          errorMessage: result.success ? undefined : getErrorMessage(result.errorType),
        };

        if (result.success) {
          const { expenses, incomes } = await mapScrapedTransactions(result, account.companyId, account.companyName, categoryRules);
          
          let freshExpensesCount = 0;
          const manualTxnsToDelete: string[] = [];
          
          if (expenses.length > 0) {
            const freshExpenses = expenses.filter(t => {
              const existingMatch = transactions.find(ex => ex.date === t.date && ex.business === t.business && ex.amount === t.amount);
              
              if (existingMatch) {
                if (existingMatch.metadata?.identifier) {
                  return false; // Skips already imported scraped transactions
                }
                // Manual transaction found matching the scraped one - delete it and keep the scraped one
                manualTxnsToDelete.push(existingMatch.id);
              }
              
              if (t.metadata?.identifier && ignoredIdentifiers.includes(String(t.metadata.identifier))) return false;
              return true;
            });
            
            if (manualTxnsToDelete.length > 0) {
              deleteTransactions(manualTxnsToDelete);
            }
            
            if (freshExpenses.length > 0) {
              newlyImportedExpenses.push(...freshExpenses);
              freshExpensesCount = freshExpenses.length;
            }
          }
          let freshIncomesCount = 0;
          if (incomes.length > 0) {
            const existingIncomeKeys = new Set(income.map((i) => `${i.date}-${i.source}-${i.netAmount}`));
            const freshIncomes = incomes.filter(i => {
              if (existingIncomeKeys.has(`${i.date}-${i.source}-${i.netAmount}`)) return false;
              if (ignoredIdentifiers.includes(String(i.id))) return false; // assuming scraper uses identifier as id
              return true;
            });
            
            if (freshIncomes.length > 0) {
              newlyImportedIncomes.push(...freshIncomes);
              freshIncomesCount = freshIncomes.length;
            }
          }
          
          const totalMapped = freshExpensesCount + freshIncomesCount;
          log.txnCount = totalMapped;

          if (totalMapped > 0) {
            updateStep(account.id, { status: 'success', tooltip: `נוספו ${totalMapped} עסקאות חדשות` });
          } else {
            updateStep(account.id, { status: 'success', tooltip: `לא נמצאו עסקאות חדשות` });
          }

          const newLogs = [...(account.syncLogs || [])];
          newLogs.unshift(log);

          updateBankAccount(account.id, {
            lastSync: log.date,
            lastSyncStatus: 'success',
            lastSyncError: undefined,
            lastSyncTxnCount: totalMapped,
            syncLogs: newLogs.slice(0, 20),
          });
          console.log(`[AutoSync] Successfully synced ${account.nickname}. Imported ${expenses.length} txns and ${incomes.length} incomes.`);
        } else {
          const newLogs = [...(account.syncLogs || [])];
          newLogs.unshift(log);

          updateBankAccount(account.id, {
            lastSync: log.date,
            lastSyncStatus: 'error',
            lastSyncError: log.errorMessage,
            lastSyncTxnCount: 0,
            syncLogs: newLogs.slice(0, 20),
          });
          updateStep(account.id, { status: 'error', tooltip: log.errorMessage });
          console.error(`[AutoSync] Failed to sync ${account.nickname}: ${result.errorType}`);
        }
      } catch (err) {
        const log: SyncLog = {
          date: new Date().toISOString(),
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'שגיאה לא ידועה',
        };
        updateStep(account.id, { status: 'error', tooltip: log.errorMessage });
        const newLogs = [...(account.syncLogs || [])];
        newLogs.unshift(log);

        updateBankAccount(account.id, {
          lastSync: log.date,
          lastSyncStatus: 'error',
          lastSyncError: log.errorMessage,
          lastSyncTxnCount: 0,
          syncLogs: newLogs.slice(0, 20),
        });
        console.error(`[AutoSync] Exception syncing ${account.nickname}:`, err);
      }
    }

    // AI Analysis phase
    updateStep('ai', { status: 'active', tooltip: `מנתח ${newlyImportedExpenses.length} עסקאות ו-${newlyImportedIncomes.length} הכנסות...` });
    if (newlyImportedExpenses.length > 0 || newlyImportedIncomes.length > 0) {
      try {
        const categoryNames = categories.map(c => c.name);
        const manualRules = Object.fromEntries(
          Object.entries(categoryRules).filter(([b]) => categoryRulesMeta?.[b]?.source === 'manual')
        );
        const analysis = await llmAnalyzeNewTransactions(newlyImportedExpenses, newlyImportedIncomes, recurring, categoryNames, manualRules);
        
        // Merge categorizations into the newly imported expenses
        const threshold = useSettings.getState().aiConfidenceThreshold ?? 80;
        const finalExpenses = newlyImportedExpenses.map(tx => {
          const aiCat = analysis.categorizations[tx.business];
          const confidence = aiCat?.confidence;
          if (aiCat && aiCat.confidence >= threshold) {
            setCategoryRule(tx.business, aiCat.category as any, { date: new Date().toISOString(), source: 'ai' });
            return { ...tx, category: aiCat.category as any, aiProcessed: true, aiLog: analysis.log, aiConfidence: confidence };
          }
          return { ...tx, aiProcessed: true, aiLog: analysis.log, aiConfidence: confidence };
        });

        // Apply income categorizations and deletions automatically
        let finalIncomes = [...newlyImportedIncomes];
        

        if (analysis.incomeCategorizations) {
          finalIncomes = finalIncomes.map(inc => {
            if (analysis.incomeCategorizations![inc.source]) {
              return { ...inc, type: analysis.incomeCategorizations![inc.source] as any };
            }
            return inc;
          });
        }
        
        
        // If AI suggested deleting a refund, suggest deleting the original expense too!
        const extraDeletes: { transactionId: string; reason: string }[] = [];
        
        analysis.toDelete.forEach(aiDel => {
          const tx = newlyImportedExpenses.find(t => t.id === aiDel.transactionId);
          if (tx && (tx.amount < 0 || tx.business.includes('החזר') || tx.business.includes('ביטול') || tx.business.includes('זיכוי'))) {
            const opposite = transactions.find(t => t.business === tx.business && t.amount === Math.abs(tx.amount)) ||
                             newlyImportedExpenses.find(t => t.business === tx.business && t.amount === Math.abs(tx.amount));
            if (opposite && !analysis.toDelete.some(d => d.transactionId === opposite.id) && !extraDeletes.some(d => d.transactionId === opposite.id)) {
              extraDeletes.push({
                transactionId: opposite.id,
                reason: `מחיקה אוטומטית כיוון שהעסקה המקורית בוטלה/הוחזרה בתאריך ${tx.date}`
              });
            }
          }
        });

        // Run local matching heuristics and merge into recommendations
        const localLinks = getLocalLinkRecommendations(newlyImportedExpenses, recurring, transactions);
        const combinedLinks = [...analysis.toLink];
        for (const local of localLinks) {
          if (!combinedLinks.some(l => l.transactionId === local.transactionId)) {
            combinedLinks.push(local);
          }
        }

        // Combine with existing AI recommendations
        const currentRecs = aiRecommendations || { toDelete: [], toLink: [], categorizations: {}, incomesToDelete: [] };
        const updatedRecommendations = {
          toDelete: [...currentRecs.toDelete, ...analysis.toDelete, ...extraDeletes],
          toLink: [...currentRecs.toLink, ...combinedLinks],
          categorizations: { ...currentRecs.categorizations, ...analysis.categorizations },
          incomesToDelete: [...(currentRecs.incomesToDelete || []), ...(analysis.incomesToDelete || [])],
          log: analysis.log
        };
        
        const finalExpensesWithRecs = finalExpenses.map(tx => {
           let recMsg = analysis.categorizations[tx.business] ? 'סווג אוטומטית על ידי AI' : undefined;
           const delRec = [...analysis.toDelete, ...extraDeletes].find(d => d.transactionId === tx.id);
           if (delRec) recMsg = `המלצת מחיקה: ${delRec.reason}`;
           const linkRec = combinedLinks.find(l => l.transactionId === tx.id);
           if (linkRec) recMsg = `המלצת קישור לחיוב קבוע`;
           return { ...tx, aiRecommendation: recMsg || tx.aiRecommendation };
        });
        
        setAiRecommendations(updatedRecommendations);
        addTransactions(finalExpensesWithRecs);
        if (finalIncomes.length > 0) {
          addIncomes(finalIncomes);
        }
        
        // Notify via Telegram if duplicates or links found
        if (telegramBotToken && telegramChatId) {
          const dupCount = analysis.toDelete.length;
          const linkCount = combinedLinks.length;
          if (dupCount > 0 || linkCount > 0) {
            let msg = '🤖 *עדכון מה-AI המערכתי*\\n\\n';
            if (dupCount > 0) msg += `זיהיתי <b>${dupCount}</b> תנועות כפולות שכדאי למחוק.\\n`;
            if (linkCount > 0) msg += `מצאתי <b>${linkCount}</b> העברות בין חשבונות שכדאי לקשר.\\n`;
            msg += '\\nהיכנס למערכת ללשונית "תנועות" לאישור ההמלצות.';
            import('../lib/telegram').then(m => m.sendMessage(telegramBotToken, telegramChatId, msg));
          }
        }

        
        const categorizedTxns = finalExpenses.filter(tx => analysis.categorizations[tx.business] && analysis.categorizations[tx.business].confidence >= threshold).length;
        
        updateStep('ai', { 
          status: 'success', 
          details: {
            categorizedTxns,
            uniqueBusinesses: Object.keys(analysis.categorizations).length,
            totalTxns: newlyImportedExpenses.length,
            toLinkCount: analysis.toLink.length,
            toDeleteCount: analysis.toDelete.length + (analysis.incomesToDelete?.length || 0),
            log: analysis.log
          }
        });
      } catch (err: any) {
        console.error('AI Analysis failed during auto-sync:', err);
        updateStep('ai', { status: 'error', tooltip: `סנכרון בוטל עקב שגיאת AI: ${err.message || err}` });
        syncingInProgress.current = false;
        return;
      }
    } else {
      updateStep('ai', { status: 'success', tooltip: 'לא נמצאו עסקאות חדשות לניתוח' });
    }

    // DB Save phase
    updateStep('db', { status: 'active', tooltip: 'שומר שינויים בבסיס הנתונים...' });
    await new Promise(resolve => setTimeout(resolve, 500));
    updateStep('db', { status: 'success', tooltip: 'הנתונים נשמרו בהצלחה' });
    
    finishSync();
    syncingInProgress.current = false;
  }

  useEffect(() => {
    // Run initial check on app load
    checkAndSync();

    // Check based on user setting
    const intervalMs = (autoSyncIntervalMinutes || 60) * 60 * 1000;
    const interval = setInterval(checkAndSync, intervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccounts.length, autoSyncIntervalMinutes]);
}
