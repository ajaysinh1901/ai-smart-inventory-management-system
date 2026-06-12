/**
 * OnboardingContext
 *
 * Provides onboarding state across the app:
 *   - currentStep (1-based, 1..7)
 *   - completedSteps (array of step numbers)
 *   - dismissed (user pressed "I'll do this later")
 *   - storeProfile ('small' | 'big')
 *
 * Reads from localStorage key `smartstock-onboarding-draft` on mount.
 * Server state is written by onboardingService; this context only holds
 * the UI state so TopNav can show the resume pill without a fresh API call.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadOnboardingState } from '../services/onboardingService';

const LS_KEY = 'smartstock-onboarding-draft';

const defaults = {
  currentStep: 1,
  completedSteps: [],
  dismissed: false,
  storeProfile: 'small',
  open: false,
  // false until we have reconciled with the server (Settings.onboarding).
  // The wizard stays hidden while false so it can't flash for users who
  // already finished setup on another device.
  hydrated: false,
};

export const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const isComplete = (parsed.completedSteps?.length ?? 0) >= 7 || (parsed.currentStep ?? 1) > 7;
        // Auto-open if resuming an incomplete, non-dismissed wizard (first page load)
        const autoOpen = !isComplete && !parsed.dismissed;
        return { ...defaults, ...parsed, open: autoOpen };
      }
    } catch {
      // ignore
    }
    // Brand new user — auto-open wizard on first load
    return { ...defaults, open: true };
  });

  // Persist key fields to localStorage whenever they change
  useEffect(() => {
    try {
      const { currentStep, completedSteps, dismissed, storeProfile } = state;
      localStorage.setItem(LS_KEY, JSON.stringify({ currentStep, completedSteps, dismissed, storeProfile }));
    } catch {
      // ignore
    }
  }, [state.currentStep, state.completedSteps, state.dismissed, state.storeProfile]);

  // Reconcile with the server once on mount. The server (Settings.onboarding)
  // is the source of truth: if the DB says onboarding is complete or dismissed,
  // close the wizard even though localStorage may be stale (e.g. a fresh device,
  // or a demo account seeded straight into the DB).
  //
  // This effect only ever CLOSES the wizard — it never force-opens it — so a
  // returning user who manually closed an incomplete wizard is not re-popped.
  // It always sets `hydrated: true` (even on a network failure) so the wizard
  // is allowed to render once reconciliation has been attempted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let server = null;
      try {
        server = await loadOnboardingState();
      } catch {
        // ignore — fall back to localStorage state
      }
      if (cancelled) return;
      setState(s => {
        if (!server) return { ...s, hydrated: true };
        const completedSteps = [
          ...new Set([...(s.completedSteps || []), ...(server.completedSteps || [])]),
        ].sort((a, b) => a - b);
        const currentStep = Math.max(s.currentStep || 1, server.currentStep || 0) || 1;
        const dismissed = server.dismissed ?? s.dismissed;
        const serverComplete =
          completedSteps.length >= 7 || currentStep > 7 || !!server.completedAt;
        return {
          ...s,
          hydrated: true,
          currentStep,
          completedSteps,
          dismissed,
          open: serverComplete || dismissed ? false : s.open,
        };
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const openWizard = useCallback(() => setState(s => ({ ...s, open: true })), []);
  const closeWizard = useCallback(() => setState(s => ({ ...s, open: false })), []);

  const dismissWizard = useCallback(() => {
    setState(s => ({ ...s, dismissed: true, open: false }));
  }, []);

  const setCurrentStep = useCallback((step) => {
    setState(s => ({ ...s, currentStep: step }));
  }, []);

  const markStepComplete = useCallback((step) => {
    setState(s => ({
      ...s,
      completedSteps: s.completedSteps.includes(step)
        ? s.completedSteps
        : [...s.completedSteps, step],
      currentStep: Math.max(s.currentStep, step + 1),
    }));
  }, []);

  const setStoreProfile = useCallback((profile) => {
    setState(s => ({ ...s, storeProfile: profile }));
  }, []);

  const resetOnboarding = useCallback(() => {
    setState({ ...defaults });
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }, []);

  const isComplete = state.completedSteps.length >= 7 || state.currentStep > 7;
  const showResumePill = !isComplete && !state.dismissed && !state.open;

  return (
    <OnboardingContext.Provider value={{
      ...state,
      isComplete,
      showResumePill,
      openWizard,
      closeWizard,
      dismissWizard,
      setCurrentStep,
      markStepComplete,
      setStoreProfile,
      resetOnboarding,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  // Return null-safe defaults when called outside OnboardingProvider
  // so TopNav can safely import this hook without crashing.
  if (!ctx) {
    return {
      currentStep: 1,
      completedSteps: [],
      dismissed: false,
      storeProfile: 'small',
      open: false,
      hydrated: true,
      isComplete: true,
      showResumePill: false,
      openWizard: () => {},
      closeWizard: () => {},
      dismissWizard: () => {},
      setCurrentStep: () => {},
      markStepComplete: () => {},
      setStoreProfile: () => {},
      resetOnboarding: () => {},
    };
  }
  return ctx;
}
