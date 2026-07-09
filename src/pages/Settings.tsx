import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, TrendingUp, Bell, CheckCircle, XCircle, Loader2, AlertTriangle, Camera, Building2, CheckCircle2, Save, Check, Receipt, CalendarRange, Landmark, Wallet, PiggyBank, Target, Book, Tag, Cog, Sparkles, HandCoins, Building, RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import { useSettings } from '../store/settingsStore';
import { useStore, usePortfolioSummary } from '../store';
import { manualSyncExchangeRate } from '../hooks/useExchangeRateSync';
import Card from '../components/common/Card';
import BankAccounts from '../components/common/BankAccounts';
import { testBot, getUpdates, sendMessage, sendPhoto } from '../lib/telegram';
import { fetchQuotes } from '../lib/yahooFinance';
import { capturePortfolioChart } from '../utils/capturePortfolioChart';
import toast from 'react-hot-toast';

type Tab = 'banks' | 'stocks' | 'telegram' | 'notifications' | 'data';

const DATA_KEYS = [
  { key: 'transactions', label: 'עסקאות והוצאות', icon: Receipt },
  { key: 'recurring', label: 'חיובים קבועים', icon: CalendarRange },
  { key: 'lots', label: 'מניות ותיק השקעות', icon: TrendingUp },
  { key: 'savings', label: 'פיקדונות', icon: Landmark },
  { key: 'gemel', label: 'קופות גמל', icon: PiggyBank },
  { key: 'hishtalmut', label: 'קרן השתלמות', icon: Wallet },
  { key: 'pension', label: 'פנסיה', icon: Building },
  { key: 'income', label: 'הכנסות', icon: HandCoins },
  { key: 'goals', label: 'יעדים ותקציב', icon: Target },
  { key: 'journal', label: 'יומן פיננסי', icon: Book },
  { key: 'categories', label: 'קטגוריות', icon: Tag },
  { key: 'categoryRules', label: 'כללי קטגוריות אוטומטיות', icon: Cog },
  { key: 'aiRecommendations', label: 'המלצות AI', icon: Sparkles },
  { key: 'settings', label: 'הגדרות כלליות', icon: Cog },
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const s = useSettings();
  const { resetAllData, resetDataPartial, usdIls, usdIlsLastUpdate, setUsdIls, lots, deletedTransactionsLog, unignoreIdentifier } = useStore();
  const { rows: portfolioRows } = usePortfolioSummary();
  const [capturingChart, setCapturingChart] = useState(false);
  const [chartSendStatus, setChartSendStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  // Modals state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSelection, setExportSelection] = useState<Record<string, boolean>>(
    Object.fromEntries(DATA_KEYS.map(k => [k.key, true]))
  );
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedImportData, setParsedImportData] = useState<any>(null);
  const [importSelection, setImportSelection] = useState<Record<string, boolean>>({});

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetSelection, setResetSelection] = useState<Record<string, boolean>>(
    Object.fromEntries(DATA_KEYS.map(k => [k.key, true]))
  );

  async function sendChartNow() {
    if (portfolioRows.length === 0 || !s.telegramBotToken || !s.telegramChatId) return;
    setCapturingChart(true);
    setChartSendStatus('idle');
    try {
      const blob = await capturePortfolioChart(lots, usdIls, s.corsProxy, portfolioRows);
      const date = new Date().toLocaleDateString('he-IL');
      const ok = await sendPhoto(s.telegramBotToken, s.telegramChatId, blob, `📊 סיכום תיק מניות — ${date}`);
      setChartSendStatus(ok ? 'ok' : 'error');
    } catch (e) {
      setChartSendStatus('error');
    } finally {
      setCapturingChart(false);
    }
  }
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'banks');
  const [usdSyncLoading, setUsdSyncLoading] = useState(false);

  useEffect(() => {
    const queryTab = searchParams.get('tab') as Tab;
    if (queryTab && ['banks', 'stocks', 'telegram', 'notifications', 'data'].includes(queryTab)) {
      setTab(queryTab);
    }
  }, [searchParams]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setSearchParams({ tab: newTab });
  };

  const [resetConfirm, setResetConfirm] = useState('');
  const [tgStatus, setTgStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [tgBotName, setTgBotName] = useState('');
  const [stockTestStatus, setStockTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');

  async function handleSaveConfig() {
    setSaveStatus('saving');
    try {
      const apiUrl = typeof window === 'undefined' ? 'http://localhost:3002/api/settings' : '/api/settings';
      const res = await fetch(apiUrl);
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        toast.error('שגיאה באימות השמירה מול השרת');
        setSaveStatus('idle');
      }
    } catch (err: any) {
      toast.error(`שגיאה בחיבור לשרת: ${err.message}`);
      setSaveStatus('idle');
    }
  }

  // ── Testing states ────────────────────────────────────────────────────────
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTestLLM = async () => {
    if (!s.llmApiKey) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      if (s.llmProvider === 'gemini') {
        const modelString = s.llmModel || 'gemini-flash-latest';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelString}:generateContent?key=${s.llmApiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 5 }
          })
        });
        if (!res.ok) {
          let extraInfo = '';
          if (res.status === 404) {
            // Try fetching available models to help user
            try {
              const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${s.llmApiKey}`);
              if (listRes.ok) {
                const listData = await listRes.json();
                const models = listData.models
                  ?.filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
                  .map((m: any) => m.name.replace('models/', '')) || [];
                extraInfo = `\n\nהמודלים שזמינים עבור המפתח שלך:\n${models.join(', ')}`;
              }
            } catch (e) { }
          }
          const errData = await res.json().catch(() => ({}));
          toast.error(`Gemini API Error: ${res.status} ${res.statusText}\n${JSON.stringify(errData)}${extraInfo}`);
        }
        setTestResult(res.ok ? 'success' : 'error');
      } else {
        const modelString = s.llmModel || 'gpt-4o-mini';
        const url = `https://api.openai.com/v1/chat/completions`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s.llmApiKey}`
          },
          body: JSON.stringify({
            model: modelString,
            messages: [{ role: 'user', content: "ping" }],
            max_tokens: 5,
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast.error(`OpenAI API Error: ${res.status} ${res.statusText}\n${JSON.stringify(errData)}`);
        }
        setTestResult(res.ok ? 'success' : 'error');
      }
    } catch (err: any) {
      toast.error(`Network Error: ${err.message}`);
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'banks', label: 'חשבונות בנק', icon: <Building2 size={15} /> },
    { key: 'stocks', label: 'מניות ו-API', icon: <TrendingUp size={15} /> },
    { key: 'telegram', label: 'Telegram בוט', icon: <Bot size={15} /> },
    { key: 'notifications', label: 'התראות', icon: <Bell size={15} /> },
    { key: 'data', label: 'ניהול נתונים', icon: <AlertTriangle size={15} /> },
  ];

  // ── Telegram ──────────────────────────────────────────────────────────────
  async function testTelegram() {
    setTgStatus('loading');
    const result = await testBot(s.telegramBotToken);
    if (result.ok) {
      setTgBotName(result.name ?? '');
      setTgStatus('ok');
    } else {
      setTgStatus('error');
    }
  }

  async function autoDetectChatId() {
    const chatId = await getUpdates(s.telegramBotToken);
    if (chatId) s.update({ telegramChatId: chatId });
  }

  async function sendTestMessage() {
    const ok = await sendMessage(
      s.telegramBotToken,
      s.telegramChatId,
      '✅ <b>פינסטאר</b> — הבוט מחובר ועובד בהצלחה!'
    );
    if (ok) {
      toast.success('הודעת בדיקה נשלחה!');
    } else {
      toast.error('שגיאה בשליחת הודעה. בדוק את ה-Token וה-Chat ID.');
    }
  }

  // ── Stock API test ────────────────────────────────────────────────────────
  async function testStockApi() {
    setStockTestStatus('loading');
    try {
      const res = await fetchQuotes(['AAPL'], s.corsProxy);
      setStockTestStatus(res['AAPL'] ? 'ok' : 'error');
    } catch (e) {
      setStockTestStatus('error');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">הגדרות</h1>
        <p className="text-slate-500 text-sm">חיבורים, API ורשתות</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Banks tab ──────────────────────────────────────────────────── */}
      {tab === 'banks' && (
        <div className="space-y-5">
          <BankAccounts />

          <Card className="space-y-5">
            <Section title="סנכרון ומיון אוטומטי">
              <Field label="תדירות סנכרון אוטומטי (דקות)" hint="המערכת תסנכרן חשבונות שחסרים נתונים אוטומטית כשהאפליקציה פתוחה.">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={s.autoSyncIntervalMinutes || 60}
                  onChange={(e) => s.update({ autoSyncIntervalMinutes: +e.target.value })}
                  className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </Field>

              <Field label="טווח שאיבה בסנכרון (ימים)" hint="כמה ימים אחורה לשאוב עסקאות בכל פעם שהסנכרון רץ.">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={s.autoSyncDaysBack || 30}
                  onChange={(e) => s.update({ autoSyncDaysBack: +e.target.value })}
                  className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </Field>

              <div className="border-t border-slate-100" />

              <Field label="מנוע בינה מלאכותית (LLM)" hint="משמש לסיווג אוטומטי של בתי עסק שאינם מוכרים למערכת.">
                <select
                  value={s.llmProvider || 'gemini'}
                  onChange={(e) => s.update({ llmProvider: e.target.value as 'gemini' | 'openai' })}
                  className="w-full sm:w-64 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="gemini">Google Gemini (חינמי מומלץ)</option>
                  <option value="openai">OpenAI (ChatGPT)</option>
                </select>
              </Field>

              <Field label="מפתח API (API Key)" hint={`קבל מפתח מ-${s.llmProvider === 'gemini' ? 'Google AI Studio' : 'OpenAI Platform'}. המפתח נשמר אצלך בדפדפן בלבד.`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <input
                    value={s.llmApiKey || ''}
                    onChange={(e) => {
                      s.update({ llmApiKey: e.target.value });
                      setTestResult(null); // Reset status on key change
                    }}
                    className="flex-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="הזן API Key..."
                    type="password"
                  />
                  <select
                    value={s.llmModel || (s.llmProvider === 'gemini' ? 'gemini-flash-latest' : 'gpt-4o-mini')}
                    onChange={e => s.update({ llmModel: e.target.value })}
                    className="w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono bg-white"
                  >
                    {s.llmProvider === 'gemini' ? (
                      <>
                        <option value="gemini-flash-latest">gemini-flash-latest</option>
                        <option value="gemini-flash-lite-latest">gemini-flash-lite-latest</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
                        <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                        <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                        <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                        <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                      </>
                    ) : (
                      <>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                      </>
                    )}
                  </select>
                  <button
                    onClick={handleTestLLM}
                    disabled={!s.llmApiKey || isTesting}
                    className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 size={16} className="animate-spin" /> : "בדוק חיבור"}
                  </button>
                  {testResult === 'success' && (
                    <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-2 rounded-lg text-sm shrink-0">
                      <CheckCircle2 size={16} /> מחובר
                    </div>
                  )}
                  {testResult === 'error' && (
                    <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-3 py-2 rounded-lg text-sm shrink-0">
                      <XCircle size={16} /> שגיאה
                    </div>
                  )}
                </div>
              </Field>

              {s.llmProvider === 'gemini' && (
                <>
                  <Field label="מפתח API גיבוי 1 (Backup Key 1)" hint="מפתח גיבוי למקרה של מגבלת קצב (Rate Limit) במפתח הראשי.">
                    <input
                      value={s.llmApiKey2 || ''}
                      onChange={(e) => s.update({ llmApiKey2: e.target.value })}
                      className="w-full max-w-lg border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                      placeholder="הזן מפתח גיבוי 1..."
                      type="password"
                    />
                  </Field>
                  <Field label="מפתח API גיבוי 2 (Backup Key 2)" hint="מפתח גיבוי שני למקרה ששני המפתחות הקודמים הגיעו למגבלת קצב.">
                    <input
                      value={s.llmApiKey3 || ''}
                      onChange={(e) => s.update({ llmApiKey3: e.target.value })}
                      className="w-full max-w-lg border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                      placeholder="הזן מפתח גיבוי 2..."
                      type="password"
                    />
                  </Field>
                </>
              )}

              <Field label="סף ביטחון לסיווג אוטומטי (%)" hint="עסקאות שהבינה המלאכותית מזהה בביטחון נמוך מהסף הזה יועברו לסטטוס 'ממתינים לשיוך' ולא יסווגו אוטומטית.">
                <div className="flex items-center gap-4 max-w-sm">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={s.aiConfidenceThreshold ?? 80}
                    onChange={(e) => s.update({ aiConfidenceThreshold: parseInt(e.target.value, 10) })}
                    className="flex-1 accent-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-700 w-12 text-left">{s.aiConfidenceThreshold ?? 80}%</span>
                </div>
              </Field>
            </Section>
          </Card>
        </div>
      )}

      {/* ── Stocks tab ─────────────────────────────────────────────────── */}
      {tab === 'stocks' && (
        <Card className="space-y-5">
          <Section title="שער המרה">
            <Field label='שער דולר-שקל (1$ = ₪ כמה?)' hint="משפיע על כל ההמרות באתר — תיק מניות, לוח בקרה וכו׳. הזן שער עדכני או סנכרן אוטומטית.">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">1$ =</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={0.01}
                    value={usdIls}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) setUsdIls(v);
                    }}
                    className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-sm text-slate-500">₪</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      setUsdSyncLoading(true);
                      const rate = await manualSyncExchangeRate(s.corsProxy);
                      setUsdSyncLoading(false);
                      if (rate) {
                        setUsdIls(rate);
                        toast.success(`שער הדולר עודכן בהצלחה ל-₪${rate.toFixed(2)}`);
                      } else {
                        toast.error('שגיאה בסנכרון שער הדולר');
                      }
                    }}
                    disabled={usdSyncLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {usdSyncLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    סנכרן שער
                  </button>

                  {usdIlsLastUpdate && (
                    <span className="text-xs text-slate-400">
                      עדכון אחרון: {new Date(usdIlsLastUpdate).toLocaleDateString('he-IL', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  )}
                </div>
              </div>
            </Field>
          </Section>

          <div className="border-t border-slate-100" />

          <Section title="Yahoo Finance API">
            <Field label="CORS Proxy URL" hint="Yahoo Finance לא מאפשר קריאות ישירות מהדפדפן. הפרוקסי חינמי ופתוח.">
              <div className="flex gap-2">
                <input
                  value={s.corsProxy}
                  onChange={(e) => s.update({ corsProxy: e.target.value })}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="/api/yahoo/"
                />
                <button
                  onClick={() => s.update({ corsProxy: '/api/yahoo/' })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
                >
                  ברירת מחדל
                </button>
              </div>
            </Field>

            <Field label="תדירות רענון (שניות)" hint="מינימום 60 שניות בשעות מסחר — Free plan. מחוץ לשעות: ×5">
              <input
                type="number"
                min={60}
                max={3600}
                value={s.stockRefreshSec}
                onChange={(e) => s.update({ stockRefreshSec: +e.target.value })}
                className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </Field>

            <div className="flex items-center gap-3">
              <button
                onClick={testStockApi}
                disabled={stockTestStatus === 'loading'}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {stockTestStatus === 'loading' && <Loader2 size={14} className="animate-spin" />}
                בדוק חיבור (AAPL)
              </button>
              {stockTestStatus === 'ok' && <span className="text-green-600 flex items-center gap-1"><CheckCircle size={16} /> מחובר</span>}
              {stockTestStatus === 'error' && <span className="text-red-500 flex items-center gap-1"><XCircle size={16} /> שגיאה — בדוק את ה-proxy</span>}
            </div>
          </Section>

          <div className="border-t border-slate-100 pt-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
              <b>Free Plan Yahoo Finance:</b><br />
              • אין מפתח API — מחיר חינמי לצמיתות<br />
              • Symbols: AAPL, MSFT, TLV.TA (מניות ת"א)<br />
              • שעות מסחר: רענון כל {s.stockRefreshSec} שניות<br />
              • מחוץ לשעות: רענון כל {s.stockRefreshSec * 5} שניות
            </div>
          </div>
        </Card>
      )}

      {/* ── Telegram tab ───────────────────────────────────────────────── */}
      {tab === 'telegram' && (
        <Card className="space-y-5">
          <Section title="הגדרת בוט Telegram">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-2">
              <p className="font-medium text-slate-700">כיצד ליצור בוט:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                <li>פתח Telegram וחפש <code className="bg-white border px-1 rounded">@BotFather</code></li>
                <li>שלח <code className="bg-white border px-1 rounded">/newbot</code> ותן שם לבוט</li>
                <li>העתק את ה-<b>Bot Token</b> שתקבל</li>
                <li>שלח הודעה לבוט שיצרת (כדי לאפשר Chat ID)</li>
                <li>לחץ "זהה Chat ID אוטומטית" למטה</li>
              </ol>
            </div>

            <Field label="Bot Token" hint="מ-@BotFather | דוג׳: 123456789:ABCdef...">
              <input
                value={s.telegramBotToken}
                onChange={(e) => s.update({ telegramBotToken: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                type="password"
              />
            </Field>

            <Field label="Chat ID" hint="מספר השיחה שאליה ישלחו ההתראות">
              <div className="flex gap-2">
                <input
                  value={s.telegramChatId}
                  onChange={(e) => s.update({ telegramChatId: e.target.value })}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="-1001234567890"
                />
                <button
                  onClick={autoDetectChatId}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 whitespace-nowrap"
                >
                  זהה אוטומטית
                </button>
              </div>
            </Field>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => {
                  s.update({ telegramBotToken: s.telegramBotToken, telegramChatId: s.telegramChatId });
                  toast.success('הגדרות טלגרם נשמרו למערכת בהצלחה!');
                }}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm hover:bg-slate-800"
              >
                שמור הגדרות לשרת
              </button>
              <button
                onClick={testTelegram}
                disabled={!s.telegramBotToken || tgStatus === 'loading'}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-40"
              >
                {tgStatus === 'loading' && <Loader2 size={14} className="animate-spin" />}
                <Bot size={14} /> בדוק Token
              </button>
              <button
                onClick={sendTestMessage}
                disabled={!s.telegramBotToken || !s.telegramChatId}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                שלח הודעת בדיקה
              </button>
            </div>
            {tgStatus === 'ok' && <p className="text-green-600 flex items-center gap-1 text-sm"><CheckCircle size={15} /> בוט מחובר: @{tgBotName}</p>}
            {tgStatus === 'error' && <p className="text-red-500 flex items-center gap-1 text-sm"><XCircle size={15} /> Token שגוי או בוט לא פעיל</p>}
          </Section>

          <div className="border-t border-slate-100" />

          <Section title="הודעות נכנסות מהבוט">
            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
              <div>
                <div className="font-medium text-slate-900 text-sm">הפעל קבלת הודעות</div>
                <div className="text-xs text-slate-500 mt-0.5">האפליקציה מאזינה להודעות שתשלח לבוט (פולינג כל 5 שניות)</div>
              </div>
              <div
                onClick={() => s.update({ telegramPollingEnabled: !s.telegramPollingEnabled })}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${s.telegramPollingEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${s.telegramPollingEnabled ? 'right-1' : 'left-1'}`} />
              </div>
            </label>

            {s.telegramPollingEnabled && (
              <div className="space-y-3">
                {/* Menu buttons */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm space-y-3">
                  <p className="font-semibold text-blue-800">⌨️ מקלדת מובנית</p>
                  <p className="text-blue-700 text-xs">כשהבוט מחובר, מקלדת קבועה מופיעה בתחתית הצ׳אט — ללא צורך בקלידת פקודות:</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {[
                      { btn: '➕ הוסף הוצאה',      desc: 'ויזארד מודרך: סכום → עסק → קטגוריה' },
                      { btn: '💰 תקציב החודש',     desc: 'הוצאה לעומת תקציב לכל קטגוריה' },
                      { btn: '📋 הוצאות אחרונות',  desc: '5 הוצאות אחרונות עם כפתור מחיקה' },
                      { btn: '✅ ממתינות',          desc: 'עסקאות עם סטטוס "ממתין" במערכת' },
                      { btn: '🔍 חיפוש',            desc: 'חיפוש לפי שם עסק או קטגוריה' },
                      { btn: '📅 חיובים קרובים',   desc: 'חיובים מחזוריים ב-7 הימים הקרובים' },
                      { btn: '📊 סיכום תיק מניות', desc: 'שולח תמונת גרף תיק המניות' },
                    ].map(({ btn, desc }) => (
                      <div key={btn} className="flex items-center gap-2">
                        <span className="bg-white border border-blue-200 rounded px-2 py-0.5 text-xs font-medium text-blue-800 shrink-0">{btn}</span>
                        <span className="text-xs text-blue-600">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick add + NLP */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-2">
                  <p className="font-semibold text-slate-700">⚡ הוספה מהירה ושאלות חופשיות</p>
                  <div className="flex flex-wrap gap-2">
                    {['150 קפה גרג', '85.50 סופר', 'כמה הוצאתי החודש?', 'כמה נשאר לי בקניות?'].map((ex) => (
                      <code key={ex} className="bg-white border rounded px-2 py-0.5 text-xs font-mono">{ex}</code>
                    ))}
                  </div>
                </div>

                {/* Recurring & Pending */}
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm space-y-2">
                  <p className="font-semibold text-green-800">🔔 התראות אוטומטיות</p>
                  <ul className="text-green-700 text-xs space-y-1 list-disc mr-4">
                    <li>3 ימים לפני חיוב מחזורי — אישור עם כפתורים</li>
                    <li>עסקאות ממתינות — שליחה אוטומטית עם אישור/עריכה/מחיקה</li>
                    <li>תקציב קטגוריה ב-80% — אזהרה</li>
                    <li>חריגה מתקציב (100%) — התראה אדומה</li>
                  </ul>
                </div>

                <p className="text-xs text-slate-400">🔒 רק צ'אט ה-ID המוגדר למעלה מורשה לשלוח פקודות לבוט</p>
              </div>
            )}
          </Section>
        </Card>
      )}

      {/* ── Notifications tab ──────────────────────────────────────────── */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          {!s.telegramBotToken && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              יש להגדיר בוט Telegram בטאב "Telegram בוט" כדי לקבל התראות
            </div>
          )}

          {/* Alert cards */}
          <Card className="space-y-3">
            <Section title="התראות אוטומטיות">
              {([
                {
                  key: 'notifyBudgetOverrun' as const,
                  emoji: '⚠️',
                  label: 'חריגה מיעד תקציב',
                  trigger: 'מתי: כשסה"כ הוצאות בקטגוריה עוברות את היעד שהוגדר',
                  example: '⚠️ פינסטאר — חריגה מתקציב\nקטגוריה: מסעדות וקפה\nהוצאה: ₪1,240 | תקציב: ₪1,000\nחריגה: ₪240',
                },
                {
                  key: 'notifySavingsExpiry' as const,
                  emoji: '📅',
                  label: 'פיקדון עומד לפוג',
                  trigger: 'מתי: 30 יום לפני מועד הפירעון של פיקדון פתוח',
                  example: '📅 פינסטאר — פיקדון עומד לפוג\nפיקדון: פיקדון הפועלים (בנק הפועלים)\nסכום: ₪50,000 | פירעון: 15/07/2026',
                },
                {
                  key: 'notifyRecurringCharge' as const,
                  emoji: '💳',
                  label: 'חיוב קבוע מתקרב',
                  trigger: 'מתי: 3 ימים לפני מועד חיוב קבוע פעיל',
                  example: '💳 פינסטאר — חיוב קבוע ב-3 ימים\nNetflix\nסכום: ₪62 | ביום: 15 לחודש',
                },
              ] as const).map(({ key, emoji, label, trigger, example }) => (
                <div key={key} className={`rounded-xl border transition-colors ${s[key] ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">{label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{trigger}</div>
                      </div>
                    </div>
                    <div
                      onClick={() => s.update({ [key]: !s[key] })}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${s[key] ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${s[key] ? 'right-1' : 'left-1'}`} />
                    </div>
                  </div>
                  {s[key] && (
                    <div className="mx-4 mb-3 bg-slate-800 rounded-lg px-3 py-2">
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{example}</pre>
                    </div>
                  )}
                </div>
              ))}

              {/* Portfolio change — inline threshold */}
              <div className={`rounded-xl border transition-colors ${s.notifyPortfolioChange > 0 ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📈</span>
                    <div>
                      <div className="font-medium text-slate-900 text-sm">שינוי מחיר מניה</div>
                      <div className="text-xs text-slate-500 mt-0.5">מתי: כשמניה עולה/יורדת ביותר מ-X% ביום</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number" min={0} max={50}
                      value={s.notifyPortfolioChange}
                      onChange={(e) => s.update({ notifyPortfolioChange: +e.target.value })}
                      className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </div>
                {s.notifyPortfolioChange > 0 && (
                  <div className="mx-4 mb-3 bg-slate-800 rounded-lg px-3 py-2">
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{`📈 פינסטאר — שינוי בתיק\n\nAAPL: +${s.notifyPortfolioChange.toFixed(1)}%\nמחיר נוכחי: $195.20`}</pre>
                  </div>
                )}
              </div>
            </Section>
          </Card>

          {/* Portfolio summary */}
          <Card className="space-y-4">
            <Section title="סיכום תיק מניות">
              <div className={`rounded-xl border transition-colors ${s.notifyPortfolioSummary ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📊</span>
                    <div>
                      <div className="font-medium text-slate-900 text-sm">שלח סיכום תיק לטלגרם</div>
                      <div className="text-xs text-slate-500 mt-0.5">הודעה מפורטת עם שווי, תשואה ומחיר לכל מניה</div>
                    </div>
                  </div>
                  <div
                    onClick={() => s.update({ notifyPortfolioSummary: !s.notifyPortfolioSummary })}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${s.notifyPortfolioSummary ? 'bg-blue-600' : 'bg-slate-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${s.notifyPortfolioSummary ? 'right-1' : 'left-1'}`} />
                  </div>
                </div>

                {s.notifyPortfolioSummary && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Schedule */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">שעת שליחה:</span>
                        <input
                          type="time"
                          value={s.portfolioSummaryTime}
                          onChange={(e) => s.update({ portfolioSummaryTime: e.target.value })}
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-sm text-slate-600 ml-1">ימים:</span>
                        {[
                          { d: 0, label: 'א' }, { d: 1, label: 'ב' }, { d: 2, label: 'ג' },
                          { d: 3, label: 'ד' }, { d: 4, label: 'ה' }, { d: 5, label: 'ו' }, { d: 6, label: 'ש' },
                        ].map(({ d, label }) => {
                          const active = s.portfolioSummaryDays.length === 0
                            ? false
                            : s.portfolioSummaryDays.includes(d);
                          return (
                            <button
                              key={d}
                              onClick={() => {
                                const cur = s.portfolioSummaryDays;
                                if (cur.length === 0) {
                                  s.update({ portfolioSummaryDays: [d] });
                                } else if (cur.includes(d)) {
                                  const next = cur.filter((x) => x !== d);
                                  s.update({ portfolioSummaryDays: next });
                                } else {
                                  s.update({ portfolioSummaryDays: [...cur, d].sort() });
                                }
                              }}
                              className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => s.update({ portfolioSummaryDays: [] })}
                          className={`px-2 h-7 rounded-full text-xs font-medium transition-colors ${s.portfolioSummaryDays.length === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          כל יום
                        </button>
                      </div>
                    </div>

                    {/* Send now button */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        disabled={!s.telegramBotToken || !s.telegramChatId || portfolioRows.length === 0 || capturingChart}
                        onClick={sendChartNow}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-40"
                      >
                        {capturingChart
                          ? <><Loader2 size={13} className="animate-spin" /> מכין תמונה...</>
                          : <><Camera size={13} /> שלח גרף עכשיו</>}
                      </button>
                      {chartSendStatus === 'ok' && <span className="text-green-600 flex items-center gap-1 text-sm"><CheckCircle size={14} /> נשלח!</span>}
                      {chartSendStatus === 'error' && <span className="text-red-500 flex items-center gap-1 text-sm"><XCircle size={14} /> שגיאה בשליחה</span>}
                      <span className="text-xs text-slate-400">
                        {s.portfolioSummaryDays.length === 0
                          ? `כל יום בשעה ${s.portfolioSummaryTime}`
                          : `בימים ${['א','ב','ג','ד','ה','ו','ש'].filter((_,i) => s.portfolioSummaryDays.includes(i)).join('/')} בשעה ${s.portfolioSummaryTime}`}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 flex items-start gap-2">
                      <Camera size={13} className="shrink-0 mt-0.5" />
                      <span>נשלחת <b>תמונה של הגרף</b> (3 חודשים אחרונים) — כולל שווי נוכחי, קו עלות הרכישה ואחוז תשואה</span>
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </Card>

          {/* Automatic summaries via Telegram bot */}
          {s.telegramPollingEnabled && (
            <Card className="space-y-4">
              <Section title="סיכומים אוטומטיים בטלגרם">

                {/* Daily summary */}
                <div className={`rounded-xl border transition-colors ${s.dailySummaryEnabled ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">סיכום יומי</div>
                        <div className="text-xs text-slate-500 mt-0.5">רשימת כל ההוצאות של היום בשעה שתגדיר</div>
                      </div>
                    </div>
                    <div
                      onClick={() => s.update({ dailySummaryEnabled: !s.dailySummaryEnabled })}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${s.dailySummaryEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${s.dailySummaryEnabled ? 'right-1' : 'left-1'}`} />
                    </div>
                  </div>
                  {s.dailySummaryEnabled && (
                    <div className="px-4 pb-3 flex items-center gap-2">
                      <span className="text-sm text-slate-600">שעת שליחה:</span>
                      <input
                        type="time"
                        value={s.dailySummaryTime}
                        onChange={(e) => s.update({ dailySummaryTime: e.target.value })}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Weekly summary */}
                <div className={`rounded-xl border transition-colors ${s.weeklySummaryEnabled ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📊</span>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">סיכום שבועי</div>
                        <div className="text-xs text-slate-500 mt-0.5">כל יום ראשון בשעה 09:00 — הוצאות לפי קטגוריה</div>
                      </div>
                    </div>
                    <div
                      onClick={() => s.update({ weeklySummaryEnabled: !s.weeklySummaryEnabled })}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${s.weeklySummaryEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${s.weeklySummaryEnabled ? 'right-1' : 'left-1'}`} />
                    </div>
                  </div>
                </div>

                {/* Monthly summary */}
                <div className={`rounded-xl border transition-colors ${s.monthlySummaryEnabled ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🗓️</span>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">סיכום חודשי</div>
                        <div className="text-xs text-slate-500 mt-0.5">באחד לכל חודש בשעה 09:00 — ניתוח החודש שעבר</div>
                      </div>
                    </div>
                    <div
                      onClick={() => s.update({ monthlySummaryEnabled: !s.monthlySummaryEnabled })}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${s.monthlySummaryEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${s.monthlySummaryEnabled ? 'right-1' : 'left-1'}`} />
                    </div>
                  </div>
                </div>

              </Section>
            </Card>
          )}
        </div>
      )}

      {/* ── Data Management tab ──────────────────────────────────────── */}
      {tab === 'data' && (
        <div className="space-y-4">
          <Card className="space-y-4">
            <Section title="גיבוי וייבוא נתונים">
              <p className="text-sm text-slate-500">ייצוא וייבוא כל הנתונים כקובץ JSON מקומי</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm hover:bg-slate-700"
                >
                  ייצא JSON
                </button>

                <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 cursor-pointer">
                  ייבא JSON
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        try {
                          const parsed = JSON.parse(event.target?.result as string);
                          setParsedImportData(parsed);
                          
                          // Auto-select all available keys in the parsed data that match our valid keys
                          const sel: Record<string, boolean> = {};
                          DATA_KEYS.forEach(k => {
                            if (parsed[k.key] !== undefined) sel[k.key] = true;
                          });
                          setImportSelection(sel);
                          
                          setShowImportModal(true);
                        } catch (err) {
                          toast.error('שגיאה בייבוא הקובץ');
                        }
                      };
                      reader.readAsText(file);
                      // Reset file input so same file can be selected again
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </Section>
          </Card>

          <Card className="space-y-4">
            <Section title="עסקאות שנמחקו">
              <p className="text-sm text-slate-500">
                עסקאות שנמחקו (באתר או בטלגרם) ומגיעות מסנכרון בנק/אשראי לא ייובאו שוב באופן אוטומטי.
                {deletedTransactionsLog.length > 0 && ` (${deletedTransactionsLog.length} רשומות)`}
              </p>
              {deletedTransactionsLog.length === 0 ? (
                <p className="text-sm text-slate-400 italic">אין עדיין עסקאות שנמחקו.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto space-y-2 -mx-1 px-1">
                  {deletedTransactionsLog.map((entry) => (
                    <div
                      key={`${entry.identifier}-${entry.deletedAt}`}
                      className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Trash2 size={14} className="text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 truncate">{entry.business}</div>
                          <div className="text-xs text-slate-400">
                            ₪{entry.amount.toLocaleString('he-IL')} · {new Date(entry.date).toLocaleDateString('he-IL')}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          unignoreIdentifier(entry.identifier);
                          toast.success(`"${entry.business}" יוכל להיכנס שוב בסנכרון הבא`);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 shrink-0"
                        title="הסר מרשימת החסימה — התנועה תיובא שוב בסנכרון הבא"
                      >
                        <RotateCcw size={12} /> שחזר
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </Card>

          <Card className="space-y-4 border-2 border-red-200">
            <Section title="⚠️ אזור מסוכן — איפוס נתונים">
              <div className="bg-red-50 rounded-xl p-4 text-sm text-red-800 space-y-1">
                <p className="font-semibold">פעולה זו תמחק לצמיתות את כל:</p>
                <ul className="list-disc list-inside space-y-0.5 text-red-700">
                  <li>עסקאות והוצאות</li>
                  <li>חיובים קבועים</li>
                  <li>תיק השקעות ומחירים</li>
                  <li>פיקדונות, גמל ופנסיה</li>
                  <li>הכנסות ויעדים</li>
                  <li>יומן פיננסי</li>
                </ul>
                <p className="mt-2 font-medium">הקטגוריות שהגדרת יישמרו.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  הקלד <span className="font-bold text-red-600">אפס</span> לאישור
                </label>
                <input
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  className="w-48 border border-red-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="אפס"
                />
              </div>

              <div className="flex gap-4">
                <button
                  disabled={resetConfirm !== 'אפס'}
                  onClick={() => {
                    resetAllData();
                    setResetConfirm('');
                    toast.success('כל הנתונים אופסו. הקטגוריות נשמרו.');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <AlertTriangle size={14} /> מחיקה מלאה
                </button>
                <button
                  disabled={resetConfirm !== 'אפס'}
                  onClick={() => {
                    setShowResetModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  <AlertTriangle size={14} /> מחיקה חלקית
                </button>
              </div>
            </Section>
          </Card>
        </div>
      )}

      {/* ── Global Save Button ─────────────────────────────────────────── */}
      <div className="flex justify-end pt-4 border-t border-slate-200 mt-8 mb-4">
        <button
          onClick={handleSaveConfig}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            saveStatus === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saveStatus === 'saving' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saveStatus === 'success' ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {saveStatus === 'success' ? 'נשמר בהצלחה!' : 'שמור הגדרות'}
        </button>
      </div>

      {/* ── Export Modal ─────────────────────────────────────────────────── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-bold text-slate-800 mb-4">מה לייצא?</h2>
            <div className="space-y-2 mb-6 max-h-[60vh] overflow-y-auto pl-2">
              {DATA_KEYS.map(({ key, label }) => {
                let countText = '';
                if (key === 'settings') {
                  countText = '(קובץ הגדרות)';
                } else if (key === 'categoryRules') {
                  const store = useStore.getState();
                  const count = Object.keys(store.categoryRules || {}).length;
                  countText = `(${count} כללים)`;
                } else {
                  const store = useStore.getState();
                  const items = (store as any)[key];
                  const count = Array.isArray(items) ? items.length : 0;
                  countText = `(${count} פריטים)`;
                }
                
                return (
                  <label key={key} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                    <input
                      type="checkbox"
                      checked={exportSelection[key] || false}
                      onChange={(e) => setExportSelection(s => ({ ...s, [key]: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex-1 flex justify-between items-center">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="text-sm text-slate-500 mr-2">{countText}</span>
                    </div>
                  </label>
                );
              })}
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  const state = useStore.getState() as any;
                  const dataToExport: any = {};
                  
                  DATA_KEYS.forEach(({ key }) => {
                    if (exportSelection[key]) {
                      if (key === 'settings') {
                        // Exclude sensitive bank credentials from export
                        const { bankAccounts, ...safeSettings } = useSettings.getState();
                        dataToExport[key] = safeSettings;
                      } else if (key === 'categoryRules') {
                        dataToExport['categoryRules'] = state['categoryRules'];
                        dataToExport['categoryRulesMeta'] = state['categoryRulesMeta'] || {};
                      } else {
                        dataToExport[key] = state[key];
                      }
                    }
                  });
                  
                  const data = JSON.stringify(dataToExport, null, 2);
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `finstar-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setShowExportModal(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors font-medium"
              >
                הורד קובץ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ─────────────────────────────────────────────────── */}
      {showImportModal && parsedImportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-bold text-slate-800 mb-2">ייבוא נתונים</h2>
            <p className="text-sm text-slate-500 mb-4">בחר איזה מידע לייבא (המידע הנבחר ידרוס את הקיים מאותו סוג):</p>
            
            <div className="space-y-2 mb-6 max-h-[60vh] overflow-y-auto pl-2">
              {DATA_KEYS.map(({ key, label }) => {
                const items = parsedImportData[key];
                if (items === undefined) return null;
                
                let countText = '';
                if (key === 'settings') {
                  countText = '(קובץ הגדרות)';
                } else if (key === 'categoryRules') {
                  const count = Object.keys(items || {}).length;
                  countText = `(${count} כללים זוהו)`;
                } else {
                  const count = Array.isArray(items) ? items.length : 0;
                  countText = `(${count} פריטים זוהו)`;
                }
                
                return (
                  <label key={key} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-lg">
                    <input
                      type="checkbox"
                      checked={importSelection[key] || false}
                      onChange={(e) => setImportSelection(s => ({ ...s, [key]: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex-1 flex justify-between items-center">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="text-sm text-slate-500 mr-2">{countText}</span>
                    </div>
                  </label>
                );
              })}
              
              {Object.keys(importSelection).length === 0 && (
                <div className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded-lg border border-slate-100">
                  לא נמצא מידע נתמך בקובץ. אנא ודא שזהו קובץ גיבוי תקין של המערכת.
                </div>
              )}
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedImportData(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
              >
                ביטול
              </button>
              <button
                disabled={!Object.values(importSelection).some(v => v)}
                onClick={() => {
                  const dataToImport: any = {};
                  DATA_KEYS.forEach(({ key }) => {
                    if (importSelection[key] && parsedImportData[key] !== undefined) {
                      if (key === 'settings') {
                        useSettings.setState(parsedImportData[key]);
                      } else if (key === 'categoryRules') {
                        dataToImport['categoryRules'] = parsedImportData['categoryRules'];
                        dataToImport['categoryRulesMeta'] = parsedImportData['categoryRulesMeta'] || {};
                      } else {
                        dataToImport[key] = parsedImportData[key];
                      }
                    }
                  });
                  
                  if (Object.keys(dataToImport).length > 0) {
                    useStore.setState((state) => ({ ...state, ...dataToImport }));
                  }
                  toast.success('הנתונים יובאו בהצלחה!');
                  setShowImportModal(false);
                  setParsedImportData(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                ייבא נתונים נבחרים
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Modal ─────────────────────────────────────────────────── */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95">
            <h2 className="text-xl font-bold text-red-600 mb-2">מחיקה חלקית של נתונים</h2>
            <p className="text-sm text-slate-500 mb-4">בחר אילו נתונים למחוק (המידע הנבחר ימחק לחלוטין ולא יהיה ניתן לשחזור):</p>
            
            <div className="flex justify-between items-center mb-3 text-sm">
              <button 
                onClick={() => {
                  const allKeys = Object.fromEntries(DATA_KEYS.filter(k => k.key !== 'settings').map(k => [k.key, true]));
                  setResetSelection(allKeys as any);
                }}
                className="text-blue-600 font-semibold hover:underline bg-blue-50 px-2 py-1 rounded"
              >
                סמן הכל
              </button>
              <button 
                onClick={() => setResetSelection({})}
                className="text-slate-500 hover:text-slate-700 font-medium hover:underline bg-slate-50 px-2 py-1 rounded"
              >
                הסר בחירה מהכל
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-6 max-h-[60vh] overflow-y-auto pl-2 p-1">
              {DATA_KEYS.map(({ key, label, icon: Icon }) => {
                if (key === 'settings') return null; // Can't reset settings easily here, or we could reset useSettings. But let's skip settings for data reset.
                const isSelected = resetSelection[key] || false;
                return (
                  <button 
                    key={key} 
                    onClick={() => setResetSelection(s => ({ ...s, [key]: !isSelected }))}
                    className={`flex flex-col items-center justify-center p-3 text-center border-2 rounded-xl transition-all ${
                      isSelected 
                        ? 'border-red-500 bg-red-50 text-red-700 shadow-sm' 
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={24} className={`mb-2 ${isSelected ? 'text-red-500' : 'text-slate-400'}`} />
                    <span className="font-semibold text-sm leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowResetModal(false);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
              >
                ביטול
              </button>
              <button
                disabled={!Object.values(resetSelection).some(v => v)}
                onClick={() => {
                  const keysToReset = DATA_KEYS.filter(k => resetSelection[k.key] && k.key !== 'settings').map(k => k.key);
                  if (keysToReset.length > 0) {
                    resetDataPartial(keysToReset);
                    toast.success('הנתונים שנבחרו אופסו בהצלחה!');
                  }
                  setShowResetModal(false);
                  setResetConfirm(''); // reset confirm box
                }}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                מחק נתונים נבחרים
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
