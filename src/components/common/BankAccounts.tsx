import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Trash2, RefreshCw, Plus, Building2, CreditCard, ChevronDown, Eye, EyeOff, Wifi, WifiOff, AlertTriangle, History } from 'lucide-react';
import { useSettings } from '../../store/settingsStore';
import { useStore } from '../../store';
import Card from './Card';
import Modal from './Modal';
import type { BankCompanyMeta, BankAccountConfig, SyncLog } from '../../types';
import { fetchSupportedCompanies, checkScraperHealth } from '../../lib/bankScraper';
import { useManualSync } from '../../hooks/useManualSync';

// ── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(): string {
  return `bank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(iso?: string): string {
  if (!iso) return 'לא סונכרן';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Icons for bank types */
function CompanyIcon({ companyId }: { companyId: string }) {
  const isCreditCard = ['visaCal', 'max', 'isracard', 'amex'].includes(companyId);
  return isCreditCard
    ? <CreditCard size={18} className="text-violet-500" />
    : <Building2 size={18} className="text-blue-500" />;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function BankAccounts() {
  const { bankAccounts, addBankAccount, updateBankAccount, removeBankAccount } = useSettings();
  const { addTransactions, addIncomes, categoryRules } = useStore();

  const [companies, setCompanies] = useState<BankCompanyMeta[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Add-account form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [nickname, setNickname] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState(false);

  // Sync state
  const { syncAll, isSyncing } = useManualSync();

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sync history modal
  const [viewLogsAccount, setViewLogsAccount] = useState<BankAccountConfig | null>(null);

  // ── Load companies on mount ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCompanies(true);
      const online = await checkScraperHealth();
      if (cancelled) return;
      setServerOnline(online);

      if (online) {
        try {
          const list = await fetchSupportedCompanies();
          if (!cancelled) setCompanies(list);
        } catch {
          // server returned bad data
        }
      }
      if (!cancelled) setLoadingCompanies(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Add account handler ─────────────────────────────────────────────────

  function handleAddAccount() {
    const company = companies.find((c) => c.id === selectedCompany);
    if (!company) return;

    // Validate all credential fields filled
    const allFilled = company.loginFields.every((f) => credentials[f.name]?.trim());
    if (!allFilled) return;

    const account: BankAccountConfig = {
      id: nanoid(),
      companyId: company.id,
      companyName: company.name,
      nickname: nickname.trim() || company.name,
      credentials: { ...credentials },
    };

    addBankAccount(account);

    // Reset form
    setSelectedCompany('');
    setNickname('');
    setCredentials({});
    setShowAddForm(false);
  }

  // ── Selected company meta ───────────────────────────────────────────────

  const selectedCompanyMeta = companies.find((c) => c.id === selectedCompany);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Server status banner */}
      {serverOnline === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <WifiOff size={15} className="shrink-0" />
          <div>
            <b>שרת ה-scraper אינו פעיל</b> — הפעל אותו עם <code className="bg-white border px-1.5 py-0.5 rounded text-xs mx-1">cd server && npm start</code>
          </div>
        </div>
      )}

      {serverOnline === true && (
        <div className="flex items-center gap-2 text-xs text-green-600">
          <Wifi size={12} />
          שרת scraper מחובר
        </div>
      )}

      {/* Connected accounts */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">חשבונות מחוברים</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {bankAccounts.length === 0 ? 'עדיין לא חיברת חשבונות' : `${bankAccounts.length} חשבונות`}
            </p>
          </div>
          {bankAccounts.length > 1 && (
            <button
              onClick={() => syncAll(bankAccounts.map(a => a.id))}
              disabled={isSyncing || !serverOnline}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {isSyncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              סנכרן הכל
            </button>
          )}
        </div>

        {/* Account list */}
        {bankAccounts.length > 0 && (
          <div className="space-y-2">
            {bankAccounts.map((account) => {
              return (
                <div
                  key={account.id}
                  className={`rounded-xl border transition-all ${
                    account.lastSyncStatus === 'error'
                      ? 'border-red-200 bg-red-50/30'
                      : account.lastSyncStatus === 'success'
                        ? 'border-green-200 bg-green-50/30'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CompanyIcon companyId={account.companyId} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 text-sm truncate">{account.nickname}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          <span>{account.companyName}</span>
                          <span>·</span>
                          <span>{formatDate(account.lastSync)}</span>
                          {account.lastSyncStatus === 'success' && (
                            <>
                              <span>·</span>
                              <span className="text-green-600 font-medium">מחובר</span>
                            </>
                          )}
                        </div>
                        {account.lastSyncStatus === 'error' && account.lastSyncError && (
                          <div className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                            <XCircle size={11} />
                            {account.lastSyncError}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Sync button */}
                      <button
                        onClick={() => syncAll([account.id])}
                        disabled={isSyncing || !serverOnline}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-50 disabled:opacity-40 transition-colors"
                        title="סנכרן עכשיו"
                      >
                        {isSyncing
                          ? <><Loader2 size={12} className="animate-spin" /> מסנכרן...</>
                          : <><RefreshCw size={12} /> סנכרן</>}
                      </button>

                      {/* Delete button */}
                      {deleteConfirmId === account.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { removeBankAccount(account.id); setDeleteConfirmId(null); }}
                            className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                          >
                            מחק
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs hover:bg-slate-300 transition-colors"
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setViewLogsAccount(account)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="היסטוריית סנכרון"
                          >
                            <History size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(account.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="הסר חשבון"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add account button / form */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={loadingCompanies || !serverOnline}
            className="flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingCompanies
              ? <><Loader2 size={15} className="animate-spin" /> טוען חברות נתמכות...</>
              : <><Plus size={15} /> הוסף חשבון בנק / אשראי</>}
          </button>
        ) : (
          <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-slate-900 text-sm">חיבור חשבון חדש</h4>
              <button
                onClick={() => { setShowAddForm(false); setSelectedCompany(''); setCredentials({}); }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ביטול
              </button>
            </div>

            {/* Company selector */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">בחר בנק / חברת אשראי</label>
              <div className="relative">
                <select
                  value={selectedCompany}
                  onChange={(e) => {
                    setSelectedCompany(e.target.value);
                    setCredentials({});
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8 cursor-pointer"
                >
                  <option value="">— בחר —</option>
                  <optgroup label="בנקים">
                    {companies
                      .filter((c) => !['visaCal', 'max', 'isracard', 'amex'].includes(c.id))
                      .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                  <optgroup label="כרטיסי אשראי">
                    {companies
                      .filter((c) => ['visaCal', 'max', 'isracard', 'amex'].includes(c.id))
                      .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                </select>
                <ChevronDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Credential fields */}
            {selectedCompanyMeta && (
              <>
                {/* Nickname */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">כינוי (אופציונלי)</label>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={selectedCompanyMeta.name}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                {/* Dynamic login fields */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-600">פרטי התחברות</label>
                    <button
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      {showPasswords ? <EyeOff size={12} /> : <Eye size={12} />}
                      {showPasswords ? 'הסתר' : 'הצג'}
                    </button>
                  </div>

                  {selectedCompanyMeta.loginFields.map((field) => (
                    <div key={field.name}>
                      <label className="block text-xs text-slate-500 mb-0.5">{field.label}</label>
                      <input
                        type={field.type === 'password' && !showPasswords ? 'password' : 'text'}
                        value={credentials[field.name] || ''}
                        onChange={(e) => setCredentials((prev) => ({ ...prev, [field.name]: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                        autoComplete="off"
                      />
                    </div>
                  ))}
                </div>

                {/* Security notice */}
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>הפרטים נשמרים <b>מקומית בדפדפן בלבד</b> ונשלחים לשרת המקומי רק בזמן הסנכרון. אנחנו לא שולחים אותם לשום שרת חיצוני.</span>
                </div>

                {/* Submit */}
                <button
                  onClick={handleAddAccount}
                  disabled={!selectedCompanyMeta.loginFields.every((f) => credentials[f.name]?.trim())}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors w-full justify-center"
                >
                  <Plus size={15} />
                  הוסף חשבון
                </button>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Info card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-2">
        <p className="font-semibold text-slate-700">ℹ️ איך זה עובד?</p>
        <ul className="text-slate-600 text-xs space-y-1 list-disc mr-4">
          <li>הסנכרון משתמש בספריית <a href="https://github.com/eshaham/israeli-bank-scrapers" target="_blank" rel="noopener" className="text-blue-600 underline">israeli-bank-scrapers</a> (קוד פתוח)</li>
          <li>שרת Node.js מקומי מריץ דפדפן headless שנכנס לאתר הבנק ומושך עסקאות</li>
          <li>עסקאות שכבר קיימות במערכת לא יתווספו פעמיים (לפי תאריך + עסק + סכום)</li>
          <li>קטגוריזציה אוטומטית לפי כללי הקטגוריה שהגדרת</li>
          <li>ברירת מחדל: 3 חודשים אחורה</li>
        </ul>
      </div>
      {/* History Modal */}
      <Modal open={!!viewLogsAccount} onClose={() => setViewLogsAccount(null)} title={`היסטוריית סנכרון - ${viewLogsAccount?.nickname}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            מתעד את 20 פעולות הסנכרון האחרונות לחשבון זה.
          </p>
          
          {!viewLogsAccount?.syncLogs || viewLogsAccount.syncLogs.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              אין עדיין היסטוריית סנכרון לחשבון זה
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 text-slate-500 font-medium">
                  <tr>
                    <th className="px-4 py-2 font-medium">תאריך סנכרון</th>
                    <th className="px-4 py-2 font-medium">סטטוס</th>
                    <th className="px-4 py-2 font-medium">עסקאות חדשות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewLogsAccount.syncLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-700">{formatDate(log.date)}</td>
                      <td className="px-4 py-2.5">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-1.5 py-0.5 rounded text-xs">
                            <CheckCircle size={12} /> הצלחה
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-xs" title={log.errorMessage}>
                            <XCircle size={12} /> שגיאה
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {log.status === 'success' ? log.txnCount ?? 0 : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setViewLogsAccount(null)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors"
            >
              סגור
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
