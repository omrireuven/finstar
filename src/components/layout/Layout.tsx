import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen bg-app" dir="rtl">
      <Sidebar />
      <main
        key={location.pathname}
        className="flex-1 mr-64 p-6 overflow-y-auto animate-page-in"
        style={{ scrollbarGutter: 'stable' }}
      >
        <Outlet />
      </main>
    </div>
  );
}
