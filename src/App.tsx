import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
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

function AppRoutes() {
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
      <AppRoutes />
    </BrowserRouter>
  );
}
