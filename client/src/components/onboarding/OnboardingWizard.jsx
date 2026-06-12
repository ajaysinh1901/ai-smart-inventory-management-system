/**
 * OnboardingWizard (v2 — 7-step, fully wired)
 *
 * Steps 1–3: profile/GST/payment (existing implementations).
 * Steps 4–7: product seeding, opening stock, supplier, first invoice (new).
 *
 * Server persistence: every "Next" calls onboardingService.saveStep().
 * Steps 4–7 handle their own API calls inside the step components;
 * the wizard just reacts to their onSuccess/onSkip callbacks and advances.
 *
 * Timer: shows elapsed setup time in the header (per spec §C.7).
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Check, ChevronRight, ChevronLeft, X,
  User, FileText, Wallet, Package, BarChart2, Truck, ShoppingCart, Timer,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { saveStep, dismissOnboarding, completeStep7 } from '../../services/onboardingService';
import { validateGstin } from './steps/Step2GST';
import { validateUpi } from './steps/Step3Payment';
import Step1Profile from './steps/Step1Profile';
import Step2GST from './steps/Step2GST';
import Step3Payment from './steps/Step3Payment';
import Step4Products from './steps/Step4Products';
import Step5OpeningStock from './steps/Step5OpeningStock';
import Step6Supplier from './steps/Step6Supplier';
import Step7FirstInvoice from './steps/Step7FirstInvoice';
import { useToast } from '../../context/ToastContext';

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { number: 1, icon: User,         titleKey: 'onboarding.steps.1.title', descKey: 'onboarding.steps.1.desc', canSkip: false },
  { number: 2, icon: FileText,     titleKey: 'onboarding.steps.2.title', descKey: 'onboarding.steps.2.desc', canSkip: true  },
  { number: 3, icon: Wallet,       titleKey: 'onboarding.steps.3.title', descKey: 'onboarding.steps.3.desc', canSkip: true  },
  { number: 4, icon: Package,      titleKey: 'onboarding.steps.4.title', descKey: 'onboarding.steps.4.desc', canSkip: false },
  { number: 5, icon: BarChart2,    titleKey: 'onboarding.steps.5.title', descKey: 'onboarding.steps.5.desc', canSkip: true  },
  { number: 6, icon: Truck,        titleKey: 'onboarding.steps.6.title', descKey: 'onboarding.steps.6.desc', canSkip: true  },
  { number: 7, icon: ShoppingCart, titleKey: 'onboarding.steps.7.title', descKey: 'onboarding.steps.7.desc', canSkip: false },
];

// ─── Per-step initial data ────────────────────────────────────────────────────
const STEP_DEFAULTS = {
  1: { storeName: '', storeType: '', storeProfile: 'small', language: 'en', state: '', gstStateCode: '', fyStart: '04-01' },
  2: { gstin: '', legalName: '', address: '', fyStart: '04-01', eInvoiceEnabled: false, annualTurnover: '', gstRegistered: true },
  3: { upiId: '', bankLast4: '' },
};

// ─── Validation per step ──────────────────────────────────────────────────────
function validate(stepNumber, data) {
  const errs = {};
  if (stepNumber === 1) {
    if (!data.storeName?.trim()) errs.storeName = 'Store name is required';
    if (!data.storeType) errs.storeType = 'Please select a store type';
    if (!data.state) errs.state = 'Please select your state (required for GST calculation)';
  }
  if (stepNumber === 2) {
    const gstinErr = validateGstin(data.gstin);
    if (gstinErr) errs.gstin = gstinErr;
  }
  if (stepNumber === 3) {
    const upiErr = validateUpi(data.upiId);
    if (upiErr) errs.upiId = upiErr;
  }
  return errs;
}

// ─── Step indicator dot ───────────────────────────────────────────────────────
function StepDot({ step, current, completed }) {
  const Icon = step.icon;
  const isDone = completed.includes(step.number);
  const isActive = step.number === current;
  return (
    <div className={`flex items-center gap-1.5 transition-opacity duration-300 ease-carta ${isActive || isDone ? 'opacity-100' : 'opacity-35'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-200 ease-carta ${
        isDone   ? 'bg-ink dark:bg-paper text-paper dark:text-ink' :
        isActive ? 'bg-ink dark:bg-paper text-paper dark:text-ink ring-2 ring-offset-2 ring-ink/20 dark:ring-paper/20 ring-offset-paper dark:ring-offset-ink' :
                   'bg-paper-rule dark:bg-ink-rule text-ink/40 dark:text-paper/40'
      }`}>
        {isDone ? <Check size={13} strokeWidth={2.5} /> : <Icon size={13} />}
      </div>
    </div>
  );
}

// ─── Desktop side rail ────────────────────────────────────────────────────────
function SideRail({ current, completed, t }) {
  return (
    <div className="hidden lg:flex flex-col gap-1 min-w-[160px] py-1">
      {STEPS.map(step => {
        const isDone = completed.includes(step.number);
        const isActive = step.number === current;
        return (
          <div key={step.number} className={`relative flex items-center gap-2.5 px-3 py-2 transition-all duration-200 ease-carta ${isActive ? 'bg-paper-soft dark:bg-ink-soft' : ''}`}>
            {/* Editorial active accent — a 2px black bar on the left, Carta-style */}
            {isActive && <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-ink dark:bg-paper" />}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-semibold transition-colors duration-200 ease-carta tabular-nums font-mono ${
              isDone   ? 'bg-ink dark:bg-paper text-paper dark:text-ink' :
              isActive ? 'bg-ink dark:bg-paper text-paper dark:text-ink' :
                         'bg-paper-rule dark:bg-ink-rule text-ink/40 dark:text-paper/40'
            }`}>
              {isDone ? <Check size={11} strokeWidth={2.5} /> : step.number}
            </div>
            <span className={`text-xs leading-tight ${
              isActive ? 'text-ink dark:text-paper font-semibold' :
              isDone   ? 'text-ink/60 dark:text-paper/60 font-medium' :
                         'text-ink/35 dark:text-paper/35 font-medium'
            }`}>
              {t(step.titleKey)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Setup elapsed timer ──────────────────────────────────────────────────────
function SetupTimer({ startTime, t }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <span className="flex items-center gap-1 text-xs text-ink/40 dark:text-paper/40 font-mono tabular-nums">
      <Timer size={11} />
      {t('onboarding.timer', { mm, ss })}
    </span>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────
export default function OnboardingWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    open, currentStep, completedSteps, storeProfile,
    openWizard, closeWizard, dismissWizard,
    markStepComplete, setCurrentStep, setStoreProfile,
    showResumePill, isComplete, hydrated,
  } = useOnboarding();

  const startTimeRef = useRef(Date.now());

  // Form data for steps 1-3 (steps 4-7 own their own state)
  const [formData, setFormData] = useState({
    1: { ...STEP_DEFAULTS[1] },
    2: { ...STEP_DEFAULTS[2] },
    3: { ...STEP_DEFAULTS[3] },
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  // Whether steps 4-7 have completed their own work
  // (allows the Next button to be enabled for simple steps)
  const [step4Done, setStep4Done] = useState(false);
  const [step5Done, setStep5Done] = useState(false);
  const [step6Done, setStep6Done] = useState(false);

  const stepDef = STEPS[currentStep - 1];

  const patchData = useCallback((stepNum, patch) => {
    setFormData(fd => ({ ...fd, [stepNum]: { ...fd[stepNum], ...patch } }));
    if (stepNum === 1 && patch.storeProfile) setStoreProfile(patch.storeProfile);
  }, [setStoreProfile]);

  const toApiPayload = (stepNumber, data) => {
    if (stepNumber === 1) {
      const { storeName, language, ...rest } = data;
      return { ...rest, companyName: storeName, defaultLang: language };
    }
    return data;
  };

  // ─── Next handler for steps 1-3 (direct form handlers) ───────────────────
  const handleNext = async () => {
    const errs = validate(currentStep, formData[currentStep] || {});
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    await saveStep(currentStep, toApiPayload(currentStep, formData[currentStep]));
    setSaving(false);
    markStepComplete(currentStep);
  };

  // ─── Skip handler for steps 2, 3 ─────────────────────────────────────────
  const handleSkip = async () => {
    if (!stepDef.canSkip) return;
    setSkipping(true);
    if (currentStep === 2) {
      patchData(2, { gstRegistered: false });
      await saveStep(2, toApiPayload(2, { ...formData[2], gstRegistered: false }));
    } else {
      await saveStep(currentStep, toApiPayload(currentStep, formData[currentStep] || {}));
    }
    setSkipping(false);
    markStepComplete(currentStep);
  };

  // ─── Step 4 success: product(s) seeded / entered ──────────────────────────
  const handleStep4Success = useCallback(async (result) => {
    setStep4Done(true);
    await saveStep(4, result || {});
    markStepComplete(4);
  }, [markStepComplete]);

  // ─── Step 5 success/skip ──────────────────────────────────────────────────
  const handleStep5Success = useCallback(async (result) => {
    setStep5Done(true);
    await saveStep(5, result || {});
    markStepComplete(5);
  }, [markStepComplete]);

  const handleStep5Skip = useCallback(async () => {
    await saveStep(5, { skipped: true });
    markStepComplete(5);
  }, [markStepComplete]);

  // ─── Step 6 success/skip ──────────────────────────────────────────────────
  const handleStep6Success = useCallback(async (result) => {
    setStep6Done(true);
    await saveStep(6, result || {});
    markStepComplete(6);
  }, [markStepComplete]);

  const handleStep6Skip = useCallback(async () => {
    await saveStep(6, { skipped: true });
    markStepComplete(6);
  }, [markStepComplete]);

  // ─── Step 7 success — activation event ───────────────────────────────────
  const handleStep7Success = useCallback(async ({ saleId } = {}) => {
    await completeStep7();
    markStepComplete(7);
    toast.success(t('onboarding.step7.activationToast'));

    // Small profile → Quick-Sale; big profile → Dashboard with nudge toast
    setTimeout(() => {
      closeWizard();
      if (storeProfile === 'big') {
        toast.info(t('onboarding.step7.addStaffNudge'), { duration: 8000 });
        navigate('/');
      } else {
        navigate('/sale');
      }
    }, 1500);
  }, [markStepComplete, closeWizard, navigate, storeProfile, toast, t]);

  const handleBack = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const handleDismiss = async () => {
    await dismissOnboarding();
    dismissWizard();
  };

  // Stay hidden until we have reconciled with the server, so the wizard never
  // flashes for users who already finished setup (e.g. the seeded demo account).
  if (!hydrated) return null;
  if (isComplete) return null;

  const isLastStep = currentStep === 7;
  const currentData = formData[currentStep] || {};

  // For steps 1-3, show the wizard's own Next button.
  // For steps 4-7, the step component owns its submit; wizard just shows Back.
  const isWizardControlled = currentStep <= 3;

  return (
    <>
      {/* Resume pill */}
      {showResumePill && (
        <div className="mx-4 md:mx-6 mt-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-paper-soft dark:bg-ink-soft border-l-2 border-ink dark:border-paper">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-ink dark:text-paper text-lg leading-none">&#9881;</span>
              <p className="text-sm font-medium text-ink/80 dark:text-paper/80 truncate">
                {t('onboarding.resumePillText', { step: completedSteps.length, total: 7 })}
              </p>
            </div>
            <button
              type="button"
              onClick={openWizard}
              className="flex-shrink-0 text-xs font-semibold text-ink dark:text-paper underline underline-offset-4 decoration-1 hover:decoration-2 transition-all"
            >
              {t('onboarding.resumeBtn')}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t('common.close')}
              className="flex-shrink-0 text-ink/30 dark:text-paper/30 hover:text-ink dark:hover:text-paper transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Wizard modal */}
      <Modal
        open={open}
        onClose={closeWizard}
        size="xl"
        closeOnBackdrop={false}
        hideCloseButton
        title={null}
      >
        <div className="flex min-h-0">
          {/* Desktop side rail */}
          <div className="hidden lg:block border-r border-paper-rule dark:border-ink-rule p-4">
            <div className="mb-4 px-3">
              <p className="text-xs font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider">
                {t('onboarding.sideRailLabel')}
              </p>
            </div>
            <SideRail current={currentStep} completed={completedSteps} t={t} />
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header row */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-paper-rule dark:border-ink-rule flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Mobile step dots */}
                <div className="flex items-center gap-1 lg:hidden">
                  {STEPS.map((step, i) => (
                    <React.Fragment key={step.number}>
                      <StepDot step={step} current={currentStep} completed={completedSteps} />
                      {i < STEPS.length - 1 && (
                        <div className={`flex-shrink-0 w-4 h-px ${
                          completedSteps.includes(step.number) ? 'bg-green-500/40' : 'bg-paper-rule dark:bg-ink-rule'
                        }`} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {/* Step counter text */}
                <div className="hidden sm:block lg:block min-w-0">
                  <p className="text-[10px] font-mono text-ink/40 dark:text-paper/40 uppercase tracking-[0.18em]">
                    {t('onboarding.stepCounter', { current: currentStep, total: 7 })}
                  </p>
                  <h2 className="font-display text-2xl font-normal text-ink dark:text-paper mt-1 truncate tracking-tightish">
                    {t(stepDef.titleKey)}
                  </h2>
                </div>
              </div>
              {/* Timer + close */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <SetupTimer startTime={startTimeRef.current} t={t} />
                <button
                  type="button"
                  onClick={closeWizard}
                  aria-label={t('common.close')}
                  className="text-ink/30 dark:text-paper/30 hover:text-ink/60 dark:hover:text-paper/60 p-1.5 rounded-lg hover:bg-paper dark:hover:bg-ink transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Step description */}
            <div className="px-5 pt-3 pb-1 flex-shrink-0">
              <p className="text-sm text-ink/50 dark:text-paper/50">{t(stepDef.descKey)}</p>
            </div>

            {/* Step body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
              {currentStep === 1 && (
                <Step1Profile data={currentData} onChange={patch => patchData(1, patch)} errors={errors} />
              )}
              {currentStep === 2 && (
                <Step2GST data={currentData} onChange={patch => patchData(2, patch)} errors={errors} storeProfile={storeProfile} />
              )}
              {currentStep === 3 && (
                <Step3Payment data={currentData} onChange={patch => patchData(3, patch)} errors={errors} />
              )}
              {currentStep === 4 && (
                <Step4Products onSuccess={handleStep4Success} />
              )}
              {currentStep === 5 && (
                <Step5OpeningStock onSuccess={handleStep5Success} onSkip={handleStep5Skip} />
              )}
              {currentStep === 6 && (
                <Step6Supplier onSuccess={handleStep6Success} onSkip={handleStep6Skip} />
              )}
              {currentStep === 7 && (
                <Step7FirstInvoice onSuccess={handleStep7Success} />
              )}
            </div>

            {/* Footer actions — only for steps 1-3 */}
            {isWizardControlled && (
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-paper-rule dark:border-ink-rule flex-shrink-0 bg-paper-soft dark:bg-ink-soft">
                {/* Left: back / dismiss */}
                <div className="flex items-center gap-2">
                  {currentStep > 1 && (
                    <Button variant="secondary" size="sm" onClick={handleBack} icon={ChevronLeft}>
                      {t('onboarding.back')}
                    </Button>
                  )}
                  {currentStep === 1 && (
                    <button
                      type="button"
                      onClick={handleDismiss}
                      className="text-xs text-ink/40 dark:text-paper/40 hover:text-ink/70 dark:hover:text-paper/70 transition-colors"
                    >
                      {t('onboarding.doLater')}
                    </button>
                  )}
                </div>

                {/* Right: skip + next */}
                <div className="flex items-center gap-2">
                  {stepDef.canSkip && (
                    <button
                      type="button"
                      onClick={handleSkip}
                      disabled={skipping}
                      className="text-xs text-ink/50 dark:text-paper/50 hover:text-ink/80 dark:hover:text-paper/80 transition-colors disabled:opacity-50"
                    >
                      {currentStep === 2 ? t('onboarding.step2.skipGst') : t('onboarding.skip')}
                    </button>
                  )}
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleNext}
                    loading={saving}
                    icon={ChevronRight}
                    iconPosition="right"
                  >
                    {t('onboarding.next')}
                  </Button>
                </div>
              </div>
            )}

            {/* Footer for steps 4-7: just Back button */}
            {!isWizardControlled && (
              <div className="flex items-center gap-3 px-5 py-4 border-t border-paper-rule dark:border-ink-rule flex-shrink-0 bg-paper-soft dark:bg-ink-soft">
                <Button variant="secondary" size="sm" onClick={handleBack} icon={ChevronLeft}>
                  {t('onboarding.back')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
