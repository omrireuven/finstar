import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Star } from 'lucide-react';
import Sidebar from './Sidebar';
import { useTelegramPolling } from '../../hooks/useTelegramPolling';
import { useExchangeRateSync } from '../../hooks/useExchangeRateSync';
import SyncProgress from '../common/SyncProgress';

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useTelegramPolling();
  useExchangeRateSync();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-app flex-col lg:flex-row" dir="rtl">
      <SyncProgress />
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col min-w-0 lg:mr-64">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="flex items-center gap-2 font-bold text-lg text-slate-900">
            <Star size={18} className="text-blue-500" /> פינסטאר
          </div>
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 -mr-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>
        </header>

        <main
          key={location.pathname}
          className="flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto animate-page-in"
          style={{ scrollbarGutter: 'stable' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
