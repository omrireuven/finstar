import { Star, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useState } from 'react';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signIn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm text-center">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Star size={28} className="text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">פינסטאר</h1>
        <p className="text-slate-500 text-sm mb-8">ניהול פיננסי אישי</p>

        <div className="bg-slate-50 rounded-xl p-5 mb-6 text-right">
          <p className="text-sm text-slate-600 leading-relaxed">
            Firebase Authentication מופעל. יש להתחבר עם חשבון Google כדי לגשת לנתונים.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700 text-right">
            {error}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin text-slate-400" />
          ) : (
            /* Google G logo */
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.77-2.7.77-2.08 0-3.84-1.4-4.47-3.29H1.88v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.51 10.53A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.04.25-1.53V5.4H1.88A8 8 0 0 0 .98 9c0 1.29.31 2.51.9 3.6l2.63-2.07z"/>
              <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.1 4.4l2.63 2.07c.63-1.89 2.39-3.29 4.47-3.29z"/>
            </svg>
          )}
          {loading ? 'מתחבר...' : 'התחבר עם Google'}
        </button>

        <p className="text-xs text-slate-400 mt-5">
          ניתן לכבות את Firebase Authentication בהגדרות המערכת
        </p>
      </div>
    </div>
  );
}
