import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import HelpChatbot from '../components/HelpChatbot';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';
import { OnboardingProvider } from '../contexts/OnboardingContext';

const STORAGE_KEY = 'sidebar:collapsed';

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    catch { return false; }
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  return (
    <OnboardingProvider>
      <div className="flex h-screen overflow-hidden bg-app">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <main className="flex-1 flex flex-col overflow-y-auto w-full min-w-0 scrollbar-thin">
          <TopNav onOpenMobileMenu={() => setMobileOpen(true)} />
          {/* 7-step onboarding wizard (v2) — resume pill + modal */}
          <OnboardingWizard />
          <Outlet />
        </main>
        <HelpChatbot />
      </div>
    </OnboardingProvider>
  );
}
