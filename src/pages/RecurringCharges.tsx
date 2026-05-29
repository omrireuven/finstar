import { useState } from 'react';
import { Plus, ExternalLink, Power, Pencil, ChevronDown, ChevronUp, Link2, Trash2, Repeat, CalendarRange } from 'lucide-react';
import { useStore, useCategoryList } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import { fmtCurrency } from '../utils/format';
import type { Category, RecurringCharge } from '../types';
import { nanoid } from '../utils/nanoid';

const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

// ── Helpers ───────────────────────────────────────────────────────────────
function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Returns { current, total } for periodic charges, null for permanent. */
function paymentProgress(r: RecurringCharge): { current: number; total: number } | null {
  if ((r.chargeType ?? 'permanent') !== 'periodic' || !r.endDate) return null;
  const now   = new Date();
  const start = r.startDate ? new Date(r.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(r.endDate);
  const total   = monthsBetween(start, end) + 1;
  const current = Math.min(total, Math.max(0, monthsBetween(start, now) + 1));
  return { current, total };
}

/** Build a list of occurrence months for periodic charges only. */
interface Occurrence { key: string; year: number; month: number; isPast: boolean }

function buildOccurrences(r: RecurringCharge): Occurrence[] {
  if ((r.chargeType ?? 'permanent') !== 'periodic' || !r.endDate) return [];
  const now   = new Date();
  const start = r.startDate ? new Date(r.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(r.endDate);
  const list: Occurrence[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear(), m = cur.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    list.push({ key, year: y, month: m, isPast: new Date(y, m - 1, r.dayOfMonth) < now });
    cur.setMonth(cur.getMonth() + 1);
  }
  return list.reverse();
}

// ── Blank form ────────────────────────────────────────────────────────────
type ChargeType = 'permanent' | 'periodic';
type FormState = {
  name: string; category: Category; amount: string;
  dayOfMonth: string; card: string; cancelUrl: string;
  chargeType: ChargeType; startDate: string; endDate: string;
};
const BLANK: FormState = {
  name: '', category: 'מנויים ובידור', amount: '',
  dayOfMonth: '1', card: 'ויזה כאל', cancelUrl: '',
  chargeType: 'permanent', startDate: '', endDate: '',
};

// ── Main ──────────────────────────────────────────────────────────────────
export default function RecurringCharges() {
  const { recurring, transactions, addRecurring, updateRecurring, deleteRecurring,
          toggleRecurring, setRecurringOccurrence, updateTransaction } = useStore();
  const categoryList = useCategoryList();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addModal,   setAddModal]   = useState(false);
  const [editItem,   setEditItem]   = useState<RecurringCharge | null>(null);
  const [form,       setForm]       = useState<FormState>(BLANK);

  const [occEdit, setOccEdit] = useState<{ rid: string; key: string } | null>(null);
  const [occForm, setOccForm] = useState({ amount: '', note: '', transactionId: '' });

  // ── Form helpers ─────────────────────────────────────────────────────
  function openAdd() { setForm(BLANK); setAddModal(true); }

  function openEdit(r: RecurringCharge) {
    setEditItem(r);
    setForm({
      name: r.name, category: r.category, amount: String(r.amount),
      dayOfMonth: String(r.dayOfMonth), card: r.card,
      cancelUrl: r.cancelUrl ?? '',
      chargeType: r.chargeType ?? 'permanent',
      startDate: r.startDate ?? '',
      endDate:   r.endDate   ?? '',
    });
  }

  function saveAdd() {
    addRecurring({
      id: nanoid(), name: form.name, category: form.category,
      amount: +form.amount, dayOfMonth: +form.dayOfMonth,
      card: form.card, active: true,
      chargeType: form.chargeType,
      cancelUrl:  form.cancelUrl  || undefined,
      startDate:  form.startDate  || undefined,
      endDate:    form.chargeType === 'periodic' ? (form.endDate || undefined) : undefined,
    });
    setAddModal(false);
  }

  function saveEdit() {
    if (!editItem) return;
    updateRecurring(editItem.id, {
      name: form.name, category: form.category, amount: +form.amount,
      dayOfMonth: +form.dayOfMonth, card: form.card,
      chargeType: form.chargeType,
      cancelUrl:  form.cancelUrl  || undefined,
      startDate:  form.startDate  || undefined,
      endDate:    form.chargeType === 'periodic' ? (form.endDate || undefined) : undefined,
    });
    setEditItem(null);
  }

  // ── Occurrence edit ──────────────────────────────────────────────────
  function openOccEdit(rid: string, key: string) {
    const ov = recurring.find(r => r.id === rid)?.occurrenceOverrides?.[key];
    setOccEdit({ rid, key });
    setOccForm({ amount: ov?.amount ? String(ov.amount) : '', note: ov?.note ?? '', transactionId: ov?.transactionId ?? '' });
  }

  function saveOcc() {
    if (!occEdit) return;
    const prev = recurring.find(r => r.id === occEdit.rid)?.occurrenceOverrides?.[occEdit.key];
    const newTxnId = occForm.transactionId || undefined;
    const oldTxnId = prev?.transactionId;
    if (oldTxnId && oldTxnId !== newTxnId) updateTransaction(oldTxnId, { recurringId: undefined });
    if (newTxnId) updateTransaction(newTxnId, { recurringId: occEdit.rid, isRecurring: true });
    const hasData = occForm.amount || occForm.note || newTxnId;
    setRecurringOccurrence(occEdit.rid, occEdit.key, hasData ? {
      amount: occForm.amount ? +occForm.amount : undefined,
      note: occForm.note || undefined,
      transactionId: newTxnId,
    } : null);
    setOccEdit(null);
  }

  function clearOcc(rid: string, key: string) {
    const txnId = recurring.find(r => r.id === rid)?.occurrenceOverrides?.[key]?.transactionId;
    if (txnId) updateTransaction(txnId, { recurringId: undefined, isRecurring: false });
    setRecurringOccurrence(rid, key, null);
  }

  // ── Aggregates ───────────────────────────────────────────────────────
  const now       = new Date();
  const today     = now.getDate();
  const permanent = recurring.filter(r => (r.chargeType ?? 'permanent') === 'permanent');
  const periodic  = recurring.filter(r => r.chargeType === 'periodic');
  const active    = recurring.filter(r => r.active && !(r.endDate && new Date(r.endDate) < now));
  const totalMonthly = active.reduce((a, r) => a + r.amount, 0);
  const next7     = active.filter(r => r.dayOfMonth >= today && r.dayOfMonth <= today + 7);
  const next7Total = next7.reduce((a, r) => a + r.amount, 0);

  // ── Render helpers ───────────────────────────────────────────────────
  // Permanent: name + amount. Periodic: also requires startDate + endDate.
  const isAddValid = !!(form.name && form.amount &&
    (form.chargeType === 'permanent' || (form.startDate && form.endDate)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">חיובים קבועים ומחזוריים</h1>
          <p className="text-slate-500 text-sm">
            {permanent.filter(r => r.active).length} קבועים •{' '}
            {periodic.filter(r => r.active).length} מחזוריים •{' '}
            {recurring.filter(r => !r.active).length} מושהים
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-sm text-white hover:bg-blue-700">
          <Plus size={16} /> הוסף חיוב
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">סה"כ חיובים חודשיים</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{fmtCurrency(totalMonthly)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{active.length} פעילים</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">ב-7 ימים הבאים</div>
          <div className="text-2xl font-bold text-amber-500 mt-1">{fmtCurrency(next7Total)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{next7.length} חיובים</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">מחזוריים פעילים</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{periodic.filter(r => r.active).length}</div>
          <div className="text-xs text-slate-400 mt-0.5">עם תאריך סיום מוגדר</div>
        </Card>
      </div>

      {/* Upcoming banner */}
      {next7.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: 'linear-gradient(90deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a' }}>
          <div className="text-sm font-semibold text-amber-800 mb-2">⚡ חיובים קרובים — {fmtCurrency(next7Total)}</div>
          <div className="flex flex-wrap gap-2">
            {next7.map(r => (
              <div key={r.id} className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm">
                <span className="font-medium text-slate-900">{r.name}</span>
                <span className="text-amber-600 mr-2">{fmtCurrency(r.amount)}</span>
                <span className="text-slate-400 text-xs">ב-{r.dayOfMonth}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section: קבועים ──────────────────────────────────────────── */}
      {permanent.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Repeat size={14} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">חיובים קבועים</span>
            <span className="text-xs text-slate-400">(ללא תאריך סיום)</span>
          </div>
          {permanent.map(r => (
            <PermanentRow key={r.id} r={r} onEdit={openEdit} onToggle={() => toggleRecurring(r.id)} onDelete={() => deleteRecurring(r.id)} />
          ))}
        </div>
      )}

      {/* ── Section: מחזוריים ────────────────────────────────────────── */}
      {periodic.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CalendarRange size={14} className="text-blue-500" />
            <span className="text-sm font-semibold text-slate-600">חיובים מחזוריים</span>
            <span className="text-xs text-slate-400">(עם תאריך סיום מוגדר)</span>
          </div>
          {periodic.map(r => {
            const isExpanded = expandedId === r.id;
            const occs = isExpanded ? buildOccurrences(r) : [];
            const progress = paymentProgress(r);
            const isExpired = r.endDate && new Date(r.endDate) < now;

            return (
              <Card key={r.id} className="p-0 overflow-hidden">
                {/* Row header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{r.name}</span>
                      <Badge variant={r.active && !isExpired ? 'blue' : 'gray'}>
                        {isExpired ? 'הסתיים' : r.active ? 'פעיל' : 'מושהה'}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {r.category} • כרטיס: {r.card} • יום {r.dayOfMonth} לחודש
                      {r.startDate && <span className="mr-2">| מ-{r.startDate.slice(0,7)}</span>}
                      {r.endDate && <span>עד {r.endDate.slice(0,7)}</span>}
                    </div>
                  </div>

                  {/* Payment progress */}
                  {progress && (
                    <div className="text-center shrink-0">
                      <div className="text-xs text-slate-400 mb-1">תשלום</div>
                      <div className="text-sm font-bold text-blue-600">
                        {progress.current}<span className="text-slate-400 font-normal">/{progress.total}</span>
                      </div>
                      <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-400"
                          style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="text-lg font-bold text-slate-900 shrink-0">{fmtCurrency(r.amount)}</div>

                  <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    {r.cancelUrl && (
                      <a href={r.cancelUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-500">
                        <ExternalLink size={13} />
                      </a>
                    )}
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => toggleRecurring(r.id)} className={`p-1.5 rounded-lg border transition-colors ${r.active ? 'border-green-200 text-green-600 hover:bg-green-50' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                      <Power size={13} />
                    </button>
                    <button onClick={() => deleteRecurring(r.id)} className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="text-slate-300 shrink-0">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Occurrence table */}
                {isExpanded && (
                  <div className="border-t border-slate-100 animate-slide-down">
                    <div className="px-5 py-2 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">פירוט תשלומים</span>
                      <span className="text-xs text-slate-400">{occs.length} תשלומים</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {occs.map(occ => {
                        const ov = r.occurrenceOverrides?.[occ.key];
                        const linkedTxn = ov?.transactionId ? transactions.find(t => t.id === ov.transactionId) : undefined;
                        const actualAmount = ov?.amount ?? r.amount;
                        const isDiff = ov?.amount && ov.amount !== r.amount;

                        return (
                          <div key={occ.key} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/80 text-sm">
                            <div className="w-28 shrink-0">
                              <div className="font-medium text-slate-700">{MONTHS_HE[occ.month - 1]} {occ.year}</div>
                              <div className="text-xs text-slate-400">יום {r.dayOfMonth}</div>
                            </div>
                            <div className="w-20 shrink-0 text-slate-400 text-xs">צפוי: {fmtCurrency(r.amount)}</div>
                            <div className="w-24 shrink-0">
                              <span className={`font-semibold ${isDiff ? 'text-orange-500' : 'text-slate-700'}`}>
                                {fmtCurrency(actualAmount)}
                              </span>
                              {isDiff && <span className="text-xs text-orange-400 mr-1">↑</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              {linkedTxn ? (
                                <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-2 py-1 text-xs">
                                  <Link2 size={10} />
                                  <span className="truncate max-w-36">{linkedTxn.business}</span>
                                  <span className="text-blue-400">{fmtCurrency(linkedTxn.amount)}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">לא מקושר</span>
                              )}
                              {ov?.note && <div className="text-xs text-slate-500 mt-0.5">📝 {ov.note}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {linkedTxn ? (
                                <span className="text-xs bg-green-50 text-green-600 border border-green-100 px-2 py-0.5 rounded-full">שולם</span>
                              ) : occ.isPast ? (
                                <span className="text-xs bg-slate-50 text-slate-400 border border-slate-100 px-2 py-0.5 rounded-full">לא מסומן</span>
                              ) : (
                                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-100 px-2 py-0.5 rounded-full">עתידי</span>
                              )}
                              <button onClick={() => openOccEdit(r.id, occ.key)} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100">
                                <Pencil size={11} />
                              </button>
                              {ov && (
                                <button onClick={() => clearOcc(r.id, occ.key)} className="p-1.5 rounded-lg border border-red-100 text-red-300 hover:bg-red-50">
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add modal ────────────────────────────────────────────────── */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="הוסף חיוב">
        <ChargeForm form={form} setForm={setForm} categoryList={categoryList} />
        <button onClick={saveAdd} disabled={!isAddValid}
          className="w-full mt-4 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
          הוסף
        </button>
      </Modal>

      {/* ── Edit modal ───────────────────────────────────────────────── */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`ערוך — ${editItem?.name ?? ''}`}>
        <ChargeForm form={form} setForm={setForm} categoryList={categoryList} />
        <button onClick={saveEdit} className="w-full mt-4 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
          שמור שינויים
        </button>
      </Modal>

      {/* ── Occurrence edit modal ────────────────────────────────────── */}
      {occEdit && (() => {
        const r = recurring.find(r => r.id === occEdit.rid)!;
        const [y, m] = occEdit.key.split('-').map(Number);
        const monthLabel = `${MONTHS_HE[m - 1]} ${y}`;
        const monthTxns = transactions.filter(t =>
          t.date.startsWith(occEdit.key) && (!t.recurringId || t.recurringId === occEdit.rid)
        );
        return (
          <Modal open onClose={() => setOccEdit(null)} title={`עדכן תשלום — ${r.name} • ${monthLabel}`}>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
                סכום ברירת מחדל: <strong>{fmtCurrency(r.amount)}</strong>
                <div className="text-xs text-slate-400 mt-0.5">השאר ריק אם לא השתנה</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">סכום בפועל (₪)</label>
                <input type="number" value={occForm.amount} onChange={e => setOccForm({...occForm, amount: e.target.value})}
                  placeholder={String(r.amount)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">הערה</label>
                <input value={occForm.note} onChange={e => setOccForm({...occForm, note: e.target.value})}
                  placeholder="למה השתנה? הנחה, עלייה..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  קשר לתנועה
                  <span className="font-normal text-slate-400 mr-1 text-xs">(כדי לא לספור פעמיים)</span>
                </label>
                {monthTxns.length === 0 ? (
                  <div className="text-sm text-slate-400 border border-slate-200 rounded-lg px-3 py-2">
                    אין תנועות ב{monthLabel} — ייבא קודם מחשבון הבנק
                  </div>
                ) : (
                  <select value={occForm.transactionId} onChange={e => setOccForm({...occForm, transactionId: e.target.value})}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300">
                    <option value="">— ללא קישור —</option>
                    {monthTxns.map(t => (
                      <option key={t.id} value={t.id}>{t.date} | {t.business} | {fmtCurrency(t.amount)}</option>
                    ))}
                  </select>
                )}
              </div>
              <button onClick={saveOcc} className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700">
                שמור
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ── Permanent row (no expansion) ──────────────────────────────────────────
function PermanentRow({ r, onEdit, onToggle, onDelete }: {
  r: RecurringCharge;
  onEdit: (r: RecurringCharge) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isExpired = r.endDate && new Date(r.endDate) < new Date();
  return (
    <Card className="flex items-center gap-3 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900">{r.name}</span>
          <Badge variant={r.active && !isExpired ? 'green' : 'gray'}>
            {r.active ? 'פעיל' : 'מושהה'}
          </Badge>
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {r.category} • כרטיס: {r.card} • יום {r.dayOfMonth} לחודש
          {r.startDate && <span className="mr-2">| מ-{r.startDate.slice(0,7)}</span>}
          {r.cancelUrl && (
            <a href={r.cancelUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-600 mr-2 inline-flex items-center gap-0.5">
              <ExternalLink size={10} /> ביטול
            </a>
          )}
        </div>
      </div>
      <div className="text-lg font-bold text-slate-900 shrink-0">{fmtCurrency(r.amount)}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => onEdit(r)} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">
          <Pencil size={13} />
        </button>
        <button onClick={onToggle} className={`p-1.5 rounded-lg border transition-colors ${r.active ? 'border-green-200 text-green-600 hover:bg-green-50' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
          <Power size={13} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50">
          <Trash2 size={13} />
        </button>
      </div>
    </Card>
  );
}

// ── Shared charge form ────────────────────────────────────────────────────
function ChargeForm({ form, setForm, categoryList }: {
  form: FormState; setForm: (f: FormState) => void; categoryList: string[];
}) {
  const isPeriodic = form.chargeType === 'periodic';
  const startDateMissing = isPeriodic && !form.startDate;
  const endDateMissing   = isPeriodic && !form.endDate;

  return (
    <div className="space-y-4">

      {/* ── Type toggle ─────────────────────────────────────────────── */}
      <div className="flex rounded-xl overflow-hidden border border-slate-200" style={{ direction: 'ltr' }}>
        <button
          type="button"
          onClick={() => setForm({ ...form, chargeType: 'permanent', endDate: '' })}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${
            !isPeriodic
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Repeat size={15} />
          קבוע
        </button>
        <div className="w-px bg-slate-200" />
        <button
          type="button"
          onClick={() => setForm({ ...form, chargeType: 'periodic' })}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${
            isPeriodic
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CalendarRange size={15} />
          מחזורי
        </button>
      </div>

      {/* Context hint */}
      <div className={`text-xs px-3 py-2 rounded-lg ${isPeriodic ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>
        {isPeriodic
          ? '📅 חיוב עם תאריך סיום — נטפליקס לשנה, תשלומים לרכב, חוזה חדר כושר…'
          : '♾ חיוב ללא הגבלת זמן — שכ"ד, ביטוח, מנוי קבוע…'}
      </div>

      {/* ── Basic fields ─────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">שם החיוב <span className="text-red-400">*</span></label>
        <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
          placeholder="Netflix, שכר דירה, ביטוח רכב…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">סכום (₪) <span className="text-red-400">*</span></label>
          <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">יום בחודש</label>
          <input type="number" min="1" max="31" value={form.dayOfMonth} onChange={e => setForm({...form, dayOfMonth: e.target.value})}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">כרטיס/מקור</label>
          <input value={form.card} onChange={e => setForm({...form, card: e.target.value})}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {categoryList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* ── Dates ────────────────────────────────────────────────────── */}
      <div className={`grid gap-3 ${isPeriodic ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            תאריך התחלה
            {isPeriodic && <span className="text-red-500 mr-1">* חובה</span>}
          </label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => setForm({...form, startDate: e.target.value})}
            className={`w-full rounded-lg px-3 py-2 text-sm focus:ring-2 ${
              startDateMissing
                ? 'border-2 border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                : 'border border-slate-200 focus:border-blue-300 focus:ring-blue-100'
            }`}
          />
          {startDateMissing && (
            <p className="text-xs text-red-500 mt-1">יש להגדיר תאריך התחלה לחיוב מחזורי</p>
          )}
        </div>

        {isPeriodic && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              תאריך סיום <span className="text-red-500">* חובה</span>
            </label>
            <input
              type="date"
              value={form.endDate}
              onChange={e => setForm({...form, endDate: e.target.value})}
              min={form.startDate || undefined}
              className={`w-full rounded-lg px-3 py-2 text-sm focus:ring-2 ${
                endDateMissing
                  ? 'border-2 border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                  : 'border border-slate-200 focus:border-blue-300 focus:ring-blue-100'
              }`}
            />
            {endDateMissing && (
              <p className="text-xs text-red-500 mt-1">יש להגדיר תאריך סיום לחיוב מחזורי</p>
            )}
          </div>
        )}
      </div>

      {/* Payment summary for periodic */}
      {isPeriodic && form.startDate && form.endDate && (
        <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-center justify-between">
          <span>
            סה"כ <strong>{monthsBetween(new Date(form.startDate), new Date(form.endDate)) + 1}</strong> תשלומים
          </span>
          <span className="font-semibold">
            {fmtCurrency((+form.amount || 0) * (monthsBetween(new Date(form.startDate), new Date(form.endDate)) + 1))} סה"כ
          </span>
        </div>
      )}

      {/* Cancel URL */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">קישור לביטול <span className="text-slate-400 font-normal">(אופציונלי)</span></label>
        <input value={form.cancelUrl} onChange={e => setForm({...form, cancelUrl: e.target.value})}
          placeholder="https://…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100" />
      </div>
    </div>
  );
}
