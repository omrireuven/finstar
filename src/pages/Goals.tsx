import { useState } from 'react';
import { Pencil, X, Plus, Tags } from 'lucide-react';
import { useStore, useCategoryList, useCategoryColorMap } from '../store';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import { fmtCurrency, currentMonthKey, fmtMonthYear } from '../utils/format';
import type { Category, CategoryDef } from '../types';
import clsx from 'clsx';

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
      {/* Category list */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {categories.map((cat) =>
          editId === cat.id ? (
            /* Edit row */
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
            /* View row */
            <div key={cat.id} className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 group">
              <div className="w-4 h-4 rounded-full shrink-0 border border-white shadow-sm" style={{ backgroundColor: cat.color }} />
              <span className="flex-1 text-sm text-slate-800">{cat.name}</span>
              {cat.isBuiltIn && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">מובנית</span>}
              <button
                onClick={() => startEdit(cat)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 p-1 transition-opacity"
              >
                <Pencil size={12} />
              </button>
              {cat.name !== 'אחר' && (
                <button
                  onClick={() => removeCategory(cat.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1 transition-opacity"
                  title="מחק קטגוריה (עסקאות יועברו ל'אחר')"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )
        )}
      </div>

      {/* Add new */}
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

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bgColor = pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return (
    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: bgColor }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Goals() {
  const { transactions, goals, setGoal } = useStore();
  const categoryList = useCategoryList();
  const catColors = useCategoryColorMap();

  const [month, setMonth] = useState(currentMonthKey());
  const [editing, setEditing] = useState<Category | null>(null);
  const [editVal, setEditVal] = useState('');
  const [catModal, setCatModal] = useState(false);

  const [year, m] = month.split('-').map(Number);
  const monthTxns = transactions.filter((t) => t.date.startsWith(month));

  const spentByCategory: Record<string, number> = {};
  for (const t of monthTxns) {
    spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
  }

  const totalBudget = goals.reduce((a, g) => a + g.targetAmount, 0);
  const totalSpent = monthTxns.reduce((a, t) => a + t.amount, 0);
  const overBudget = goals.filter((g) => (spentByCategory[g.category] || 0) > g.targetAmount).length;
  const onTrack = goals.filter((g) => (spentByCategory[g.category] || 0) <= g.targetAmount).length;

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
    for (const t of transactions.filter((t) => months3.some((mk) => t.date.startsWith(mk)))) {
      if (!bycat[t.category]) bycat[t.category] = [];
      bycat[t.category].push(t.amount);
    }
    for (const [cat, amounts] of Object.entries(bycat)) {
      const avg = amounts.reduce((a, b) => a + b, 0) / 3;
      setGoal(cat as Category, Math.round(avg * 1.05));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">יעדים ותקציב</h1>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={prevMonth} className="text-slate-400 hover:text-slate-700 text-lg">›</button>
            <span className="text-slate-600 font-medium">{fmtMonthYear(year, m)}</span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-slate-700 text-lg rotate-180">›</button>
          </div>
          <p className="text-xs text-slate-400 mt-1">היעדים זהים לכל החודשים · הצג התקדמות לחודש הנבחר</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCatModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50">
            <Tags size={15} /> ניהול קטגוריות
          </button>
          <button onClick={suggestGoals} className="px-4 py-2 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-700 hover:bg-purple-100">
            ✨ הצע יעדים
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="text-sm text-slate-500">תקציב חודשי</div>
          <div className="text-2xl font-bold text-slate-900">{fmtCurrency(totalBudget)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">הוצאות בפועל</div>
          <div className={`text-2xl font-bold ${totalSpent > totalBudget ? 'text-red-500' : 'text-slate-900'}`}>{fmtCurrency(totalSpent)}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">יעדים בסדר</div>
          <div className="text-2xl font-bold text-green-600">{onTrack}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">חריגות</div>
          <div className={`text-2xl font-bold ${overBudget > 0 ? 'text-red-500' : 'text-slate-900'}`}>{overBudget}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {categoryList.map((cat) => {
          const goal = goals.find((g) => g.category === cat);
          const spent = spentByCategory[cat] || 0;
          const target = goal?.targetAmount ?? 0;
          const pct = target > 0 ? Math.min(100, (spent / target) * 100) : 0;
          const isOver = target > 0 && spent > target;
          const isEditing = editing === cat;

          return (
            <Card key={cat} className="gap-3 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: catColors[cat] ?? '#9ca3af' }} />
                  <span className="font-medium text-slate-900">{cat}</span>
                  {isOver && <span className="text-xs text-red-500 font-medium">חריגה!</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${isOver ? 'text-red-500' : 'text-slate-700'}`}>{fmtCurrency(spent)}</span>
                  <span className="text-slate-400 text-sm">/</span>
                  {isEditing ? (
                    <input
                      autoFocus
                      type="number"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onBlur={() => { if (editVal) setGoal(cat, +editVal); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { if (editVal) setGoal(cat, +editVal); setEditing(null); } if (e.key === 'Escape') setEditing(null); }}
                      className="w-24 border border-blue-300 rounded px-2 py-0.5 text-sm text-right outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditing(cat); setEditVal(String(target || '')); }}
                      className={clsx('text-sm hover:underline', target ? 'text-slate-500' : 'text-blue-500')}
                    >
                      {target ? fmtCurrency(target) : '+ הגדר יעד'}
                    </button>
                  )}
                </div>
              </div>
              {target > 0 && (
                <>
                  <ProgressBar value={spent} max={target} />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{Math.round(pct)}% מהיעד</span>
                    {isOver ? (
                      <span className="text-red-500">חריגה של {fmtCurrency(spent - target)}</span>
                    ) : (
                      <span className="text-green-600">נותר {fmtCurrency(target - spent)}</span>
                    )}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>

      <CategoryManagerModal open={catModal} onClose={() => setCatModal(false)} />
    </div>
  );
}
