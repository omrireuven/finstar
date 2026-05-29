import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './store/settingsStore';
import Layout from './components/layout/Layout';
import LoginScreen from './components/auth/LoginScreen';
import Dashboard from './pages/Dashboard';
import Expenses from './pages/Expenses';
import Stocks from './pages/Stocks';
import Savings from './pages/Savings';
import Income from './pages/Income';
import RecurringCharges from './pages/RecurringCharges';
import Goals from './pages/Goals';
import Trends from './pages/Trends';
import Simulator from './pages/Simulator';
import Reminders from './pages/Reminders';
import Settings from './pages/Settings';

/** Inner app — after AuthProvider is mounted, checks Firebase auth state */
function AppRoutes() {
  const { user, loading } = useAuth();
  const { firebaseEnabled } = useSettings();

  // Show login screen only if Firebase is enabled and user is not authenticated
  if (firebaseEnabled && !loading && !user) {
    return <LoginScreen />;
  }

  // Loading spinner while Firebase resolves auth state
  if (firebaseEnabled && loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">טוען...</span>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/stocks" element={<Stocks />} />
        <Route path="/savings" element={<Savings />} />
        <Route path="/gemel" element={<Navigate to="/savings" replace />} />
        <Route path="/pension" element={<Navigate to="/savings" replace />} />
        <Route path="/income" element={<Income />} />
        <Route path="/recurring" element={<RecurringCharges />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/journal" element={<Navigate to="/trends" replace />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
