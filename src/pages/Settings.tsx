import { useState } from 'react';
import { Bot, TrendingUp, Bell, CheckCircle, XCircle, Loader2, AlertTriangle, Camera } from 'lucide-react';
import { useSettings } from '../store/settingsStore';
import { useStore, usePortfolioSummary } from '../store';
import Card from '../components/common/Card';
import { testBot, getUpdates, sendMessage, sendPhoto } from '../lib/telegram';
import { fetchQuotes } from '../lib/yahooFinance';
import { capturePortfolioChart } from '../utils/capturePortfolioChart';

type Tab = 'stocks' | 'telegram' | 'notifications' | 'data';

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
  const { resetAllData, usdIls, setUsdIls, lots } = useStore();
  const { rows: portfolioRows } = usePortfolioSummary();
  const [capturingChart, setCapturingChart] = useState(false);
  const [chartSendStatus, setChartSendStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  async function sendChartNow() {
    if (portfolioRows.length === 0 || !s.telegramBotToken || !s.telegramChatId) return;
    setCapturingChart(true);
    setChartSendStatus('idle');
    try {
      const blob = await capturePortfolioChart(lots, usdIls, s.corsProxy, portfolioRows);
      const date = new Date().toLocaleDateString('he-IL');
      const ok = await sendPhoto(s.telegramBotToken, s.telegramChatId, blob, `📊 סיכום תיק מניות — ${date}`);
      setChartSendStatus(ok ? 'ok' : 'error');
    } catch {
      setChartSendStatus('error');
    } finally {
      setCapturingChart(false);
    }
  }
  const [tab, setTab] = useState<Tab>('stocks');
  const [resetConfirm, setResetConfirm] = useState('');
  const [tgStatus, setTgStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [tgBotName, setTgBotName] = useState('');
  const [stockTestStatus, setStockTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
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
          <Section title="שער המרה">
            <Field label='שער דולר-שקל (1$ = ₪ כמה?)' hint="משפיע על כל ההמרות באתר — תיק מניות, לוח בקרה וכו׳. הזן שער עדכני לפי מקור רשמי.">
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
                          useStore.setState((state) => ({ ...state, ...parsed }));
                          alert('הנתונים יובאו בהצלחה!');
                        } catch (err) {
                          alert('שגיאה בייבוא הקובץ');
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>
              </div>
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
