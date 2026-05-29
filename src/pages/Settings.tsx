import { useState } from 'react';
import { Bot, Flame, TrendingUp, Bell, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useSettings } from '../store/settingsStore';
import { useStore } from '../store';
import { useAuth } from '../hooks/useAuth';
import Card from '../components/common/Card';
import { testBot, getUpdates, sendMessage } from '../lib/telegram';
import { fetchQuotes } from '../lib/yahooFinance';

type Tab = 'stocks' | 'telegram' | 'firebase' | 'notifications' | 'data';

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
  const { user, signIn, signOut } = useAuth();
  const { resetAllData } = useStore();
  const [tab, setTab] = useState<Tab>('stocks');
  const [resetConfirm, setResetConfirm] = useState('');
  const [tgStatus, setTgStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [tgBotName, setTgBotName] = useState('');
  const [stockTestStatus, setStockTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [fbError, setFbError] = useState('');
  const [fbLoading, setFbLoading] = useState(false);

  // Firebase config form
  const [fbForm, setFbForm] = useState({
    apiKey: s.firebaseConfig?.apiKey ?? '',
    authDomain: s.firebaseConfig?.authDomain ?? '',
    projectId: s.firebaseConfig?.projectId ?? '',
    storageBucket: s.firebaseConfig?.storageBucket ?? '',
    messagingSenderId: s.firebaseConfig?.messagingSenderId ?? '',
    appId: s.firebaseConfig?.appId ?? '',
  });

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'stocks', label: 'מניות ו-API', icon: <TrendingUp size={15} /> },
    { key: 'telegram', label: 'Telegram בוט', icon: <Bot size={15} /> },
    { key: 'firebase', label: 'Google Login', icon: <Flame size={15} /> },
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
    alert(ok ? 'הודעת בדיקה נשלחה!' : 'שגיאה בשליחת הודעה. בדוק את ה-Token וה-Chat ID.');
  }

  // ── Stock API test ────────────────────────────────────────────────────────
  async function testStockApi() {
    setStockTestStatus('loading');
    try {
      const res = await fetchQuotes(['AAPL'], s.corsProxy);
      setStockTestStatus(res['AAPL'] ? 'ok' : 'error');
    } catch {
      setStockTestStatus('error');
    }
  }

  // ── Firebase ──────────────────────────────────────────────────────────────
  function saveFirebaseConfig() {
    setFbError('');
    const { apiKey, authDomain, projectId } = fbForm;
    if (!apiKey || !authDomain || !projectId) {
      setFbError('יש למלא לפחות apiKey, authDomain ו-projectId');
      return;
    }
    s.update({ firebaseConfig: fbForm, firebaseEnabled: true });
    alert('הגדרות Firebase נשמרו. רענן את הדף כדי להפעיל את ה-Login.');
  }

  function disableFirebase() {
    s.update({ firebaseEnabled: false, firebaseConfig: null });
  }

  async function handleGoogleSignIn() {
    setFbLoading(true);
    setFbError('');
    try { await signIn(); }
    catch (e: any) { setFbError(e?.message ?? 'שגיאה בהתחברות'); }
    finally { setFbLoading(false); }
  }

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
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Stocks tab ─────────────────────────────────────────────────── */}
      {tab === 'stocks' && (
        <Card className="space-y-5">
          <Section title="Yahoo Finance API">
            <Field label="CORS Proxy URL" hint="Yahoo Finance לא מאפשר קריאות ישירות מהדפדפן. הפרוקסי חינמי ופתוח.">
              <div className="flex gap-2">
                <input
                  value={s.corsProxy}
                  onChange={(e) => s.update({ corsProxy: e.target.value })}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="https://corsproxy.io/?"
                />
                <button
                  onClick={() => s.update({ corsProxy: 'https://corsproxy.io/?' })}
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
        </Card>
      )}

      {/* ── Firebase tab ───────────────────────────────────────────────── */}
      {tab === 'firebase' && (
        <Card className="space-y-5">
          <Section title="Firebase Google Login">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-2">
              <p className="font-medium text-slate-700">הגדרה בפעם הראשונה:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                <li>כנס ל-<a href="https://console.firebase.google.com" target="_blank" className="text-blue-600 underline">console.firebase.google.com</a></li>
                <li>צור פרויקט חדש → הוסף Web App</li>
                <li>בתפריט Authentication → Sign-in method → הפעל <b>Google</b></li>
                <li>הוסף את הדומיין שלך ל-Authorized Domains</li>
                <li>העתק את ה-Config מטה</li>
              </ol>
            </div>

            {user ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-green-800">מחובר כ: {user.displayName}</div>
                  <div className="text-sm text-green-600">{user.email}</div>
                </div>
                <button onClick={signOut} className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm hover:bg-red-100">
                  התנתק
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {(Object.keys(fbForm) as (keyof typeof fbForm)[]).map((key) => (
                  <Field key={key} label={key}>
                    <input
                      value={fbForm[key]}
                      onChange={(e) => setFbForm({ ...fbForm, [key]: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-xs"
                      placeholder={key}
                    />
                  </Field>
                ))}
              </div>
            )}

            {fbError && <p className="text-red-500 text-sm">{fbError}</p>}

            {!user && (
              <div className="flex gap-3">
                <button
                  onClick={saveFirebaseConfig}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700"
                >
                  <Flame size={14} className="inline ml-1" /> שמור הגדרות
                </button>
                {s.firebaseEnabled && (
                  <>
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={fbLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm hover:bg-slate-50"
                    >
                      {fbLoading ? <Loader2 size={14} className="animate-spin" /> : (
                        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                      )}
                      התחבר עם Google
                    </button>
                    <button onClick={disableFirebase} className="px-4 py-2 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50">
                      בטל Auth
                    </button>
                  </>
                )}
              </div>
            )}
          </Section>
        </Card>
      )}

      {/* ── Notifications tab ──────────────────────────────────────────── */}
      {tab === 'notifications' && (
        <Card className="space-y-5">
          <Section title="התראות Telegram">
            {!s.telegramBotToken && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                ⚠️ יש להגדיר בוט Telegram כדי לקבל התראות
              </div>
            )}
            {[
              { key: 'notifyBudgetOverrun' as const, label: 'חריגה מיעד תקציב', desc: 'כשהוצאה בקטגוריה חורגת מהיעד' },
              { key: 'notifySavingsExpiry' as const, label: 'פיקדון עומד לפוג', desc: '30 יום לפני פירעון' },
              { key: 'notifyRecurringCharge' as const, label: 'חיוב קבוע מתקרב', desc: '3 ימים לפני מועד החיוב' },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                <div>
                  <div className="font-medium text-slate-900">{label}</div>
                  <div className="text-xs text-slate-500">{desc}</div>
                </div>
                <div
                  onClick={() => s.update({ [key]: !s[key] })}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${s[key] ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${s[key] ? 'right-1' : 'left-1'}`} />
                </div>
              </label>
            ))}

            <Field label="התראת שינוי בתיק (%)" hint="שלח התראה כשמניה עולה/יורדת ביותר מ-X% ביום. 0 = מבוטל">
              <input
                type="number"
                min={0}
                max={50}
                value={s.notifyPortfolioChange}
                onChange={(e) => s.update({ notifyPortfolioChange: +e.target.value })}
                className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </Field>
          </Section>
        </Card>
      )}

      {/* ── Data Management tab ──────────────────────────────────────── */}
      {tab === 'data' && (
        <div className="space-y-4">
          <Card className="space-y-4">
            <Section title="גיבוי נתונים">
              <p className="text-sm text-slate-500">ייצוא כל הנתונים כקובץ JSON לגיבוי מקומי</p>
              <button
                onClick={() => {
                  const state = useStore.getState();
                  const data = JSON.stringify({
                    transactions: state.transactions,
                    recurring: state.recurring,
                    lots: state.lots,
                    savings: state.savings,
                    gemel: state.gemel,
                    pension: state.pension,
                    income: state.income,
                    goals: state.goals,
                    journal: state.journal,
                    categories: state.categories,
                  }, null, 2);
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `finstar-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm hover:bg-slate-700"
              >
                ייצא JSON
              </button>
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

              <button
                disabled={resetConfirm !== 'אפס'}
                onClick={() => {
                  resetAllData();
                  setResetConfirm('');
                  alert('כל הנתונים אופסו. הקטגוריות נשמרו.');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AlertTriangle size={14} /> אפס את כל הנתונים
              </button>
            </Section>
          </Card>
        </div>
      )}
    </div>
  );
}
