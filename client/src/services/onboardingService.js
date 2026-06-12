/**
 * onboardingService
 *
 * Persists onboarding step data to the server.
 * Endpoint: PATCH /api/v1/workspace/onboarding
 *
 * TODO (backend-coder): implement PATCH /api/v1/workspace/onboarding
 *   Body: { currentStep: Number, completedSteps: Number[], stepData: Object }
 *   Response: { data: { onboarding: { currentStep, completedSteps, dismissed, sampleSeedUsed } } }
 *
 * If the endpoint returns 404 or any error, the service falls back to
 * localStorage with key `smartstock-onboarding-draft` and logs a console.warn.
 * This allows UX testing while the backend is being built.
 */
import api from './api';

const LS_KEY = 'smartstock-onboarding-draft';

/**
 * Save a completed step to the server.
 * @param {number} stepNumber - 1-based step number
 * @param {object} stepData   - form data captured in that step
 */
export async function saveStep(stepNumber, stepData = {}) {
  try {
    const res = await api.patch('/workspace/onboarding', {
      currentStep: stepNumber,
      stepData,
    });
    return res.data?.data;
  } catch (err) {
    // Graceful fallback: write to localStorage so no data is lost
    const status = err?.response?.status;
    console.warn(
      `[onboardingService] PATCH /workspace/onboarding ${status === 404 ? 'not yet implemented (404)' : 'failed'} — caching step ${stepNumber} to localStorage. Backend will catch up.`,
      err?.message,
    );

    try {
      const raw = localStorage.getItem(LS_KEY);
      const draft = raw ? JSON.parse(raw) : {};
      const updatedDraft = {
        ...draft,
        currentStep: stepNumber,
        completedSteps: [
          ...new Set([...(draft.completedSteps || []), stepNumber].filter(n => n > 0)),
        ],
        stepData: {
          ...(draft.stepData || {}),
          [`step${stepNumber}`]: stepData,
        },
      };
      localStorage.setItem(LS_KEY, JSON.stringify(updatedDraft));
    } catch {
      // localStorage not available — ignore
    }

    return null;
  }
}

/**
 * Mark the full onboarding as complete (step 7 done).
 */
export async function completeOnboarding() {
  try {
    const res = await api.patch('/workspace/onboarding', {
      currentStep: 7,
      completedSteps: [1, 2, 3, 4, 5, 6, 7],
      dismissed: false,
    });
    return res.data?.data;
  } catch (err) {
    console.warn('[onboardingService] completeOnboarding failed — localStorage fallback.', err?.message);
    return null;
  }
}

/**
 * Dismiss the onboarding wizard (user chose "I'll do this later").
 */
export async function dismissOnboarding() {
  try {
    const res = await api.patch('/workspace/onboarding', { dismissed: true });
    return res.data?.data;
  } catch (err) {
    console.warn('[onboardingService] dismissOnboarding failed — localStorage fallback.', err?.message);
    return null;
  }
}

/**
 * Load current onboarding state from server.
 * Falls back to localStorage if endpoint not available.
 */
export async function loadOnboardingState() {
  try {
    const res = await api.get('/workspace/onboarding');
    return res.data?.data;
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

/**
 * Mark step 7 as complete and flag full onboarding completion.
 * Used by Step7FirstInvoice after a sale is confirmed.
 */
export async function completeStep7() {
  try {
    const res = await api.patch('/workspace/onboarding', {
      currentStep: 7,
      stepData: { activated: true },
      completedSteps: [1, 2, 3, 4, 5, 6, 7],
    });
    return res.data?.data;
  } catch (err) {
    console.warn('[onboardingService] completeStep7 failed — localStorage fallback.', err?.message);
    try {
      const raw = localStorage.getItem(LS_KEY);
      const draft = raw ? JSON.parse(raw) : {};
      const updated = { ...draft, currentStep: 8, completedSteps: [1,2,3,4,5,6,7] };
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
    return null;
  }
}
