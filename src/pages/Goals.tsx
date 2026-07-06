import { useState } from 'react';
import { Pencil, X, Plus, Tags, ChevronRight, ChevronLeft } from 'lucide-react';
import { useStore, useCategoryList, useCategoryColorMap } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import { fmtCurrency, currentMonthKey, fmtMonthYear } from '../utils/format';
import type { Category, CategoryDef } from '../types';

// ── Preset palette for color picker ──────────────────────────────────────────
const PRESET_COLORS = [
  '#22c55e', '#16a34a', '#f97316', '#ea580c',
  '#3b82f6', '#0891b2', '#8b5cf6', '#7c3aed',
  '#ec4899', '#ef4444', '#d97706', '#b45309',
  '#6b7280', '#374151', '#166534', '#9ca3af',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            value === c ? 'border-slate-800 scale-110 shadow' : 'border-transparent hover:scale-105'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

// ── Category manager modal ────────────────────────────────────────────────────
function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categories, addCategory, updateCategory, removeCategory } = useStore();
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  function startEdit(cat: CategoryDef) {
    setEditId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  }

  function cancelEdit() { setEditId(null); }

  function saveEdit() {
    if (!editId) return;
    const cat = categories.find((c) => c.id === editId);
    if (!cat) return;
    const patch: { name?: string; color?: string } = {};
    if (editName.trim() && editName.trim() !== cat.name) patch.name = editName.trim();
    if (editColor !== cat.color) patch.color = editColor;
    if (Object.keys(patch).length) updateCategory(editId, patch);
    cancelEdit();
  }

  function handleAdd() {
    if (!newName.trim()) return;
    addCategory(newName.trim(), newColor);
    setNewName('');
    setNewColor(PRESET_COLORS[0]);
  }

  return (
    <Modal open={open} onClose={onClose} title="ניהול קטגוריות">
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {categories.map((cat) =>
          editId === cat.id ? (
            <div key={cat.id} className="border border-blue-200 rounded-xl p-3 space-y-3 bg-blue-50/30">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={cat.name === 'אחר'}
                placeholder="שם קטגוריה"
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              />
              <ColorPicker value={editColor} onChange={setEditColor} />
              {cat.name === 'אחר' && (
                <p className="text-xs text-slate-400">קטגוריית ברירת המחדל — שמה לא ניתן לשינוי</p>
              )}
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex-1 bg-blue-600 text-white text-sm rounded-lg py-1.5 hover:bg-blue-700">שמור</button>
                <button onClick={cancelEdit} className="flex-1 border border-slate-200 text-slate-600 text-sm rounded-lg py-1.5 hover:bg-slate-50">ביטול</button>
              </div>
            </div>
          ) : (
            <div key={cat.id} className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 group">
              <div className="w-4 h-4 rounded-full shrink-0 border border-white shadow-sm" style={{ backgroundColor: cat.color }} />
              <span className="flex-1 text-sm text-slate-800">{cat.name}</span>
              {cat.isBuiltIn && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">מובנית</span>}
              <button onClick={() => startEdit(cat)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 p-1 transition-opacity">
                <Pencil size={12} />
              </button>
              {cat.name !== 'אחר' && (
                <button onClick={() => removeCategory(cat.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1 transition-opacity"
                  title="מחק קטגוריה (עסקאות יועברו ל'אחר')">
                  <X size={13} />
                </button>
              )}
            </div>
          )
        )}
      </div>

      <div className="border-t border-slate-100 pt-4 mt-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">הוסף קטגוריה חדשה</p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="שם הקטגוריה"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
        <ColorPicker value={newColor} onChange={setNewColor} />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          <Plus size={15} /> הוסף קטגוריה
        </button>
      </div>
    </Modal>
  );
}

// ── Inline editable amount ───────────────────────────────────────────────────
function AmountCell({
  value, placeholder, onSave, onCancel, isEditing, onStartEdit,
}: {
  value: number; placeholder: string; onSave: (v: number) => void;
  onCancel: () => void; isEditing: boolean; onStartEdit: () => void;
}) {
  const [draft, setDraft] = useState(String(value || ''));

  if (isEditing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft) onSave(+draft); else onCancel(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { if (draft) onSave(+draft); else onCancel(); }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="w-28 border border-blue-300 rounded-lg px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-blue-100"
      />
    );
  }
  if (value > 0) {
    return (
      <button onClick={onStartEdit} className="text-sm text-slate-500 hover:text-blue-500 transition-colors text-left">
        {fmtCurrency(value)}
      </button>
    );
  }
  return (
    <button onClick={onStartEdit} className="text-xs text-blue-500 hover:text-blue-600 hover:underline font-medium">
      + הגדר יעד
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Goals() {
  const { transactions, goals, setGoal, deleteGoal } = useStore();
  const categoryList = useCategoryList();
  const catColors = useCategoryColorMap();

  const [month, setMonth] = useState(currentMonthKey());
  const [editing, setEditing] = useState<Category | null>(null);
  const [catModal, setCatModal] = useState(false);

  const [year, m] = month.split('-').map(Number);
  const monthTxns = transactions.filter((t) => !t.pending && t.date.startsWith(month));

  const spentByCategory: Record<string, number> = {};
  for (const t of monthTxns) {
    spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
  }

  const totalBudget = goals.reduce((a, g) => a + g.targetAmount, 0);
  const totalSpent  = monthTxns.reduce((a, t) => a + t.amount, 0);
  const overBudget  = goals.filter((g) => (spentByCategory[g.category] || 0) > g.targetAmount).length;
  const onTrack     = goals.filter((g) => (spentByCategory[g.category] || 0) <= g.targetAmount).length;
  const budgetPct   = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

  function prevMonth() {
    const d = new Date(year, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const d = new Date(year, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function suggestGoals() {
    const months3 = [1, 2, 3].map((i) => {
      const d = new Date(year, m - 1 - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const bycat: Record<string, number[]> = {};
    for (const t of transactions.filter((t) => !t.pending && months3.some((mk) => t.date.startsWith(mk)))) {
      if (!bycat[t.category]) bycat[t.category] = [];
      bycat[t.category].push(t.amount);
    }
    for (const [cat, amounts] of Object.entries(bycat)) {
      const avg = amounts.reduce((a, b) => a + b, 0) / 3;
      setGoal(cat as Category, Math.round(avg * 1.05));
    }
  }

  // Sort: categories with goals first (by % spent desc), then without goals
  const catsWithGoals    = categoryList.filter((cat) => goals.some((g) => g.category === cat));
  const catsWithoutGoals = categoryList.filter((cat) => !goals.some((g) => g.category === cat));

  function renderRow(cat: string, hasGoal: boolean) {
    const goal    = goals.find((g) => g.category === cat);
    const spent   = spentByCategory[cat] || 0;
    const target  = goal?.targetAmount ?? 0;
    const pct     = target > 0 ? Math.min(100, (spent / target) * 100) : 0;
    const isOver  = hasGoal && spent > target;
    const color   = catColors[cat] ?? '#9ca3af';
    const barColor = isOver ? '#ef4444' : pct >= 80 ? '#f59e0b' : color;

    return (
      <div
        key={cat}
        className={`flex items-center gap-3 px-5 py-3 group hover:bg-slate-50 transition-colors ${!hasGoal ? 'opacity-60' : ''}`}
      >
        {/* Color dot */}
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />

        {/* Category name */}
        <span className="text-sm font-medium text-slate-800 w-32 truncate shrink-0">{cat}</span>

        {/* Progress bar */}
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          {hasGoal && (
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          )}
        </div>

        {/* Spent amount */}
        <span
          className={`text-sm font-semibold w-20 text-left shrink-0 ${
            isOver ? 'text-red-500' : hasGoal ? 'text-slate-800' : 'text-slate-400'
          }`}
        >
          {spent > 0 ? fmtCurrency(spent) : '—'}
        </span>

        <span className="text-slate-200 shrink-0">/</span>

        {/* Budget target (editable) */}
        <div className="w-28 shrink-0">
          <AmountCell
            value={target}
            placeholder="יעד"
            isEditing={editing === cat}
            onStartEdit={() => setEditing(cat as Category)}
            onSave={(v) => { setGoal(cat as Category, v); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        </div>

        {/* Status / remaining */}
        <div className="w-28 text-left shrink-0">
          {hasGoal && isOver ? (
            <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium">
              +{fmtCurrency(spent - target)}
            </span>
          ) : hasGoal && target > 0 ? (
            <span className="text-xs text-slate-400">
              {Math.round(pct)}% · נותר {fmtCurrency(target - spent)}
            </span>
          ) : null}
        </div>

        {/* Delete goal button (hover) */}
        <div className="w-5 shrink-0 flex justify-center">
          {hasGoal && goal && (
            <button
              onClick={() => deleteGoal(goal.id)}
              title="מחק יעד"
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">יעדים ותקציב</h1>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={prevMonth} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronRight size={18} />
            </button>
            <span className="text-slate-700 font-medium">{fmtMonthYear(year, m)}</span>
            <button onClick={nextMonth} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
              <ChevronLeft size={18} />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">היעדים זהים לכל החודשים · הצג התקדמות לחודש הנבחר</p>
        </div>
        <button
          onClick={() => setCatModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Tags size={15} /> ניהול קטגוריות
        </button>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">תקציב חודשי</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(totalBudget)}</div>
          <div className="text-xs text-slate-400 mt-0.5">{goals.length} קטגוריות</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">הוצאות בפועל</div>
          <div className={`text-2xl font-bold ${totalSpent > totalBudget ? 'text-red-500' : 'text-slate-900'}`}>
            {fmtCurrency(totalSpent)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{fmtMonthYear(year, m)}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">יעדים בסדר</div>
          <div className="text-2xl font-bold text-green-600">{onTrack}</div>
          <div className="text-xs text-slate-400 mt-0.5">מתוך {goals.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">חריגות</div>
          <div className={`text-2xl font-bold ${overBudget > 0 ? 'text-red-500' : 'text-slate-900'}`}>
            {overBudget}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">קטגוריות שחרגו</div>
        </Card>
      </div>

      {/* ── Budget overview bar ──────────────────────────────────────────── */}
      {totalBudget > 0 && (
        <Card>
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="font-medium text-slate-700">ניצול תקציב כולל</span>
            <span className={`font-bold ${totalSpent > totalBudget ? 'text-red-500' : 'text-slate-700'}`}>
              {fmtCurrency(totalSpent)} / {fmtCurrency(totalBudget)}
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${budgetPct}%`,
                background: totalSpent > totalBudget
                  ? '#ef4444'
                  : budgetPct > 80
                  ? '#f59e0b'
                  : '#22c55e',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="text-slate-400">{Math.round(budgetPct)}% נוצל</span>
            <span className={`font-medium ${totalSpent > totalBudget ? 'text-red-500' : 'text-green-600'}`}>
              {totalSpent > totalBudget
                ? `חריגה של ${fmtCurrency(totalSpent - totalBudget)}`
                : `נותר ${fmtCurrency(totalBudget - totalSpent)}`}
            </span>
          </div>
        </Card>
      )}

      {/* ── Category list ────────────────────────────────────────────────── */}
      <Card className="p-0 overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">יעדים לפי קטגוריה</h2>
          <button
            onClick={suggestGoals}
            className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors font-medium"
          >
            ✨ הצע יעדים מהיסטוריה
          </button>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-400 font-medium uppercase tracking-wide">
          <div className="w-2.5 shrink-0" />
          <div className="w-32 shrink-0">קטגוריה</div>
          <div className="flex-1">התקדמות</div>
          <div className="w-20 text-left shrink-0">הוצאות</div>
          <div className="w-4 shrink-0" />
          <div className="w-28 shrink-0">יעד חודשי</div>
          <div className="w-28 text-left shrink-0">מצב</div>
          <div className="w-5 shrink-0" />
        </div>

        {/* Categories with goals */}
        {catsWithGoals.length > 0 && (
          <div className="divide-y divide-slate-50">
            {catsWithGoals.map((cat) => renderRow(cat, true))}
          </div>
        )}

        {/* Categories without goals */}
        {catsWithoutGoals.length > 0 && (
          <div className={catsWithGoals.length > 0 ? 'border-t-2 border-dashed border-slate-100' : ''}>
            {catsWithGoals.length > 0 && (
              <div className="px-5 pt-3 pb-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  ללא יעד מוגדר
                </span>
              </div>
            )}
            <div className="divide-y divide-slate-50 pb-2">
              {catsWithoutGoals.map((cat) => renderRow(cat, false))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {categoryList.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm">
            אין קטגוריות להצגה
          </div>
        )}
      </Card>

      <CategoryManagerModal open={catModal} onClose={() => setCatModal(false)} />
    </div>
  );
}
