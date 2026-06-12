import React, { useState, useEffect, useRef } from 'react';
import { Building2, FileText, Wallet, Check, ChevronRight, X, AlertTriangle } from 'lucide-react';
import { getSettings, updateSettings } from '../services/settingsService';
import { Modal, Button, Input } from './ui';

const STORAGE_KEY = 'onboarding:dismissed';

const STEPS = [
  {
    id: 'company',
    icon: Building2,
    title: 'Your company name',
    description: 'This appears on every invoice you generate. Required for GST compliance.',
    fields: ['companyName', 'state'],
  },
  {
    id: 'gstin',
    icon: FileText,
    title: 'GSTIN',
    description: 'Your 15-character GST Identification Number. Used on all tax invoices.',
    fields: ['gstin'],
  },
  {
    id: 'upi',
    icon: Wallet,
    title: 'UPI & payment',
    description: 'Customers scan a QR code on the invoice to pay instantly.',
    fields: ['upiId', 'payeeName'],
  },
];

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

export default function OnboardingWizard() {
  const [open, setOpen] = useState(false);
  const [showNag, setShowNag] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [existingSettings, setExistingSettings] = useState(null);

  // Form state
  const [companyName, setCompanyName] = useState('');
  const [state, setState] = useState('');
  const [gstin, setGstin] = useState('');
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');

  // State picker
  const [stateSearch, setStateSearch] = useState('');
  const [showStateDD, setShowStateDD] = useState(false);
  const filteredStates = INDIAN_STATES.filter(s =>
    s.toLowerCase().includes(stateSearch.toLowerCase())
  );

  // Validation
  const [errors, setErrors] = useState({});
  const initialised = useRef(false);

  useEffect(() => {
    // Fetch settings once on mount. Gate with initialised ref.
    if (initialised.current) return;
    initialised.current = true;

    getSettings()
      .then(res => {
        const w = res.data?.data?.workspace || {};
        setExistingSettings(w);

        const hasCompany = !!w.companyName;
        const hasGstin = !!w.gstin;
        const hasUpi = !!w.upiId;
        const isComplete = hasCompany && hasGstin && hasUpi;

        setSettingsLoaded(true);

        // Pre-fill existing values
        if (w.companyName) setCompanyName(w.companyName);
        if (w.state) setState(w.state);
        if (w.gstin) setGstin(w.gstin);
        if (w.upiId) setUpiId(w.upiId);
        if (w.payeeName) setPayeeName(w.payeeName);

        if (!isComplete) {
          // Check if user has previously dismissed
          const dismissed = localStorage.getItem(STORAGE_KEY) === 'true';
          if (!dismissed) {
            // Open wizard automatically on first load
            setOpen(true);
          } else {
            // Show amber nag banner
            setShowNag(true);
          }
        }
      })
      .catch(() => {
        // Settings fetch failed — don't block the UI
        setSettingsLoaded(true);
      });
  }, []);

  const validateStep = () => {
    const errs = {};
    if (step === 0) {
      if (!companyName.trim()) errs.companyName = 'Company name is required';
    }
    if (step === 1) {
      if (gstin && !GSTIN_REGEX.test(gstin.toUpperCase())) {
        errs.gstin = 'Enter a valid 15-character GSTIN (e.g. 27AAPFU0939F1ZV)';
      }
    }
    if (step === 2) {
      if (upiId && !UPI_REGEX.test(upiId)) {
        errs.upiId = 'Enter a valid UPI ID (e.g. merchant@upi)';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      handleSave();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        workspace: {
          ...(existingSettings || {}),
          companyName: companyName.trim(),
          state,
          gstin: gstin.toUpperCase().trim(),
          upiId: upiId.trim(),
          payeeName: payeeName.trim(),
        },
      });
      setOpen(false);
      setShowNag(false);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // don't crash — silently ignore for now
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setOpen(false);
    setShowNag(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const handleNagOpen = () => {
    setStep(0);
    setOpen(true);
  };

  // Don't render anything until settings are loaded (avoids flash)
  if (!settingsLoaded) return null;

  const StepIcon = STEPS[step].icon;

  return (
    <>
      {/* Amber nag banner — shown after skip, hidden once complete */}
      {showNag && !open && (
        <div className="mx-6 md:mx-8 mt-4 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="font-mono font-bold text-primary dark:text-primary-soft text-base flex-shrink-0">‼</span>
          <p className="font-body text-sm text-ink/70 dark:text-paper/70 flex-1">
            <span className="font-semibold">Setup incomplete:</span> Add your company details, GSTIN, and UPI ID to enable invoices.
          </p>
          <button
            type="button"
            onClick={handleNagOpen}
            className="flex-shrink-0 text-xs font-bold text-brass-deep dark:text-brass underline hover:text-brass-deep/80 dark:hover:text-brass/80 transition-colors"
          >
            Complete setup
          </button>
          <button
            type="button"
            onClick={() => setShowNag(false)}
            aria-label="Dismiss"
            className="text-brass dark:text-brass-soft hover:text-brass-deep dark:hover:text-brass transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Wizard modal */}
      <Modal
        open={open}
        onClose={handleSkip}
        size="md"
        closeOnBackdrop={false}
        title="Welcome to SmartStock AI"
        description="Set up your business profile in 3 quick steps to start generating GST invoices."
      >
        <div className="p-6 space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <React.Fragment key={s.id}>
                  <div
                    className={`flex items-center gap-1.5 ${i === step ? 'opacity-100' : i < step ? 'opacity-100' : 'opacity-40'}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        i < step
                          ? 'bg-[#2E7D32] text-white'
                          : i === step
                          ? 'bg-primary text-white'
                          : 'bg-paper-rule dark:bg-ink-rule text-ink/40 dark:text-paper/40'
                      }`}
                    >
                      {i < step ? <Check size={14} /> : <Icon size={14} />}
                    </div>
                    <span className={`text-xs font-semibold hidden sm:block ${
                      i === step ? 'text-ink dark:text-paper' : 'text-ink/40 dark:text-paper/40'
                    }`}>
                      {s.title}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px ${i < step ? 'bg-[#2E7D32]/40 dark:bg-[#4CAF50]/40' : 'bg-paper-rule dark:bg-ink-rule'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Step content */}
          <div className="bg-paper dark:bg-ink rounded-xl p-4 border border-paper-rule dark:border-ink-rule">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
                <StepIcon size={18} />
              </div>
              <div>
                <p className="font-semibold text-ink dark:text-paper text-sm">{STEPS[step].title}</p>
                <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">{STEPS[step].description}</p>
              </div>
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <Input
                  label="Company Name"
                  required
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  error={errors.companyName}
                  placeholder="Main Street Grocery"
                  autoFocus
                />
                {/* State picker with searchable dropdown */}
                <div className="relative">
                  <Input
                    label="State"
                    value={state}
                    onChange={e => { setState(e.target.value); setStateSearch(e.target.value); setShowStateDD(true); }}
                    onFocus={() => { setShowStateDD(true); setStateSearch(state); }}
                    onBlur={() => setTimeout(() => setShowStateDD(false), 200)}
                    placeholder="Gujarat"
                  />
                  {showStateDD && filteredStates.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl shadow-lg max-h-36 overflow-y-auto scrollbar-thin">
                      {filteredStates.map(s => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); setState(s); setShowStateDD(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-ink/70 dark:text-paper/70 hover:bg-primary/5 dark:hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <Input
                  label="GSTIN"
                  value={gstin}
                  onChange={e => setGstin(e.target.value.toUpperCase())}
                  error={errors.gstin}
                  placeholder="27AAPFU0939F1ZV"
                  className="font-mono tracking-widest"
                  helperText="15-character GST Identification Number. Leave blank if unregistered."
                  autoFocus
                />
                <p className="text-xs text-brass-deep dark:text-brass flex items-start gap-1.5">
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                  Invoices without a valid GSTIN are not legally valid for GST input credit claims.
                </p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <Input
                  label="UPI ID"
                  value={upiId}
                  onChange={e => setUpiId(e.target.value)}
                  error={errors.upiId}
                  placeholder="yourstore@upi"
                  className="font-mono"
                  helperText="Customers scan a QR code on the invoice to pay. Leave blank to skip."
                  autoFocus
                />
                <Input
                  label="Payee Name (displayed on QR)"
                  value={payeeName}
                  onChange={e => setPayeeName(e.target.value)}
                  placeholder="Main Street Grocery"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper transition-colors"
            >
              Skip for now
            </button>
            <div className="flex items-center gap-3">
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep(s => s - 1)} size="md">
                  Back
                </Button>
              )}
              <Button
                variant="primary"
                onClick={handleNext}
                loading={saving}
                size="md"
                icon={step < STEPS.length - 1 ? ChevronRight : Check}
                iconPosition="right"
              >
                {step < STEPS.length - 1 ? 'Continue' : 'Finish setup'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
