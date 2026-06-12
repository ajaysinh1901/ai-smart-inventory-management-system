import React, { useContext, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, AuthContext } from './context/AuthContext';

// ── Code-split EVERY page so the first-paint chunk is tiny ────────────────────
// Dashboard pulls in Recharts (~100KB gz); pulling it eagerly inflated the
// main bundle to 771KB. Splitting here cuts initial paint by ~60%.
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const InventoryPage  = lazy(() => import('./pages/InventoryPage'));
const SuppliersPage  = lazy(() => import('./pages/SuppliersPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const SalesPage      = lazy(() => import('./pages/SalesPage'));
const AnalyticsPage  = lazy(() => import('./pages/AnalyticsPage'));
const AiInsightsPage = lazy(() => import('./pages/AiInsightsPage'));
const ScannerPage    = lazy(() => import('./pages/ScannerPage'));
const SettingsPage   = lazy(() => import('./pages/SettingsPage'));
const QuickSalePage      = lazy(() => import('./pages/QuickSalePage'));
const ReorderReportPage  = lazy(() => import('./pages/ReorderReportPage'));
const ShrinkagePage      = lazy(() => import('./pages/ShrinkagePage'));

// ── Suspense fallback ─────────────────────────────────────────────────────────
const FullPageSpinner = () => (
  <div className="min-h-[60vh] w-full flex flex-col items-center justify-center text-ink/40 dark:text-paper/40">
    <Loader2 size={28} className="animate-spin text-primary mb-3" />
    <p className="text-sm font-semibold">Loading…</p>
  </div>
);

const PrivateRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center" style={{ backgroundColor: '#F0F4F8' }}>
        <div className="w-10 h-10 border-[3px] rounded-full animate-spin mb-4" style={{ borderColor: '#D2D6DC', borderTopColor: '#213467' }} />
        <p className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: '#94A3B8' }}>Opening the books…</p>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => (
  <Suspense fallback={<FullPageSpinner />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <DashboardLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="ai-insights" element={<AiInsightsPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="sale" element={<QuickSalePage />} />
        <Route path="scanner" element={<ScannerPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="reorder-report" element={<ReorderReportPage />} />
        <Route path="shrinkage" element={<ShrinkagePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Suspense>
);

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
