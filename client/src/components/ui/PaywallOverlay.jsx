import React, { useState } from 'react';
import { Lock, Sparkles, X, Check, Mail } from 'lucide-react';
import Button from './Button';
import Modal from './Modal';

/**
 * PaywallOverlay — wraps any locked feature with a soft gate.
 *
 * Usage:
 *   <PaywallOverlay plan="growth" feature="Tally Export">
 *     <YourLockedComponent />
 *   </PaywallOverlay>
 *
 * Props:
 *   plan       : 'growth' | 'pro'   — which plan unlocks this feature
 *   feature    : string             — feature name for the CTA copy
 *   children   : ReactNode          — the locked content (shown blurred)
 *   className  : string             — extra classes on the wrapper
 */

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: null,
    annual: null,
    highlight: false,
    features: ['Up to 100 products', 'Basic invoices', 'Manual stock updates', '1 user'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 599,
    annual: 4999,
    annualSave: 2189,
    highlight: true,
    badge: 'Most Popular',
    features: [
      'Unlimited products',
      'GST invoices + Tally export',
      'Bulk WhatsApp share',
      'AI inventory insights',
      'Up to 3 users',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 1499,
    annual: 12999,
    annualSave: 4989,
    highlight: false,
    features: [
      'Everything in Growth',
      'Multi-branch / warehouse',
      'Advanced analytics',
      'Priority support',
      'Unlimited users',
    ],
  },
];

function PlanCard({ plan, billing }) {
  const monthlyEquiv = billing === 'annual' && plan.annual
    ? Math.round(plan.annual / 12)
    : plan.price;

  return (
    <div
      className={`relative rounded-2xl border p-5 flex flex-col gap-3 ${
        plan.highlight
          ? 'border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-md shadow-primary/10'
          : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card'
      }`}
    >
      {plan.badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-3 py-0.5 rounded-full whitespace-nowrap">
          {plan.badge}
        </span>
      )}
      <div>
        <p className="text-sm font-bold text-ink dark:text-paper">{plan.name}</p>
        {plan.price ? (
          <div className="mt-1">
            <span className="text-2xl font-black text-ink dark:text-paper tabular-nums">
              ₹{billing === 'annual' ? monthlyEquiv?.toLocaleString('en-IN') : plan.price?.toLocaleString('en-IN')}
            </span>
            <span className="text-xs text-ink/50 dark:text-paper/50">/mo</span>
            {billing === 'annual' && plan.annualSave && (
              <p className="text-[11px] text-[#2E7D32] dark:text-[#4CAF50] font-semibold mt-0.5">
                Save ₹{plan.annualSave.toLocaleString('en-IN')} with annual
              </p>
            )}
          </div>
        ) : (
          <p className="text-2xl font-black text-ink dark:text-paper mt-1">Free</p>
        )}
      </div>
      <ul className="space-y-1.5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-ink/70 dark:text-paper/70">
            <Check size={13} className="text-[#2E7D32] dark:text-[#4CAF50] flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PaywallOverlay({ plan = 'growth', feature = 'this feature', children, className = '' }) {
  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState('annual');
  const [requested, setRequested] = useState(false);

  const targetPlan = PLANS.find((p) => p.id === plan) || PLANS[1];

  const handleUpgrade = () => {
    // No billing backend yet — open request-access mailto
    window.location.href =
      `mailto:developers@zimbstech.com?subject=Plan upgrade request — ${targetPlan.name}&body=Hi, I'd like to upgrade to the ${targetPlan.name} plan (${billing} billing). Please get in touch!`;
    setRequested(true);
  };

  return (
    <>
      {/* Wrapper: lock icon button + blurred children */}
      <div className={`relative ${className}`}>
        {/* Blur overlay */}
        <div className="absolute inset-0 z-10 rounded-xl overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 backdrop-blur-[2px] bg-paper/50 dark:bg-ink/50 rounded-xl" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center">
              <Lock size={18} className="text-primary" />
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-4 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/25"
            >
              <Sparkles size={13} /> Upgrade to unlock
            </button>
          </div>
        </div>
        {/* Blurred content (pointer-events-none so locked content isn't clickable) */}
        <div className="pointer-events-none select-none blur-[2px] opacity-60">{children}</div>
      </div>

      {/* Upgrade modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Upgrade your plan"
        description={`${feature} is available on the ${targetPlan.name} plan and above.`}
        size="lg"
      >
        <div className="p-6 space-y-5">
          {/* Billing toggle */}
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-1 p-1 bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule">
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={`h-8 px-4 rounded-lg text-sm font-semibold transition-all ${
                  billing === 'monthly'
                    ? 'bg-paper-card dark:bg-ink-card text-ink dark:text-paper shadow-sm'
                    : 'text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling('annual')}
                className={`h-8 px-4 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  billing === 'annual'
                    ? 'bg-paper-card dark:bg-ink-card text-ink dark:text-paper shadow-sm'
                    : 'text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper'
                }`}
              >
                Annual
                <span className="text-[10px] font-bold bg-[#2E7D32] text-white px-1.5 py-0.5 rounded-full">Save 30%</span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((p) => (
              <PlanCard key={p.id} plan={p} billing={billing} />
            ))}
          </div>

          {/* Upgrade CTA */}
          <div className="rounded-xl bg-brass/8 dark:bg-brass/15 border border-brass/30 dark:border-brass/40 p-4 flex items-start gap-3">
            <div className="w-8 h-8 bg-brass/10 dark:bg-brass/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-brass-deep dark:text-brass" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brass-deep dark:text-brass">
                Plan upgrades are rolling out soon
              </p>
              <p className="text-xs text-brass-deep/80 dark:text-brass/80 mt-0.5">
                Click below to request early access. We&apos;ll reach out within 1 business day.
              </p>
            </div>
          </div>

          {requested ? (
            <div className="flex items-center gap-3 bg-[#2E7D32]/8 dark:bg-[#4CAF50]/15 rounded-xl border border-[#2E7D32]/25 dark:border-[#4CAF50]/30 p-4">
              <Check size={20} className="text-[#2E7D32] dark:text-[#4CAF50] flex-shrink-0" />
              <p className="text-sm text-[#2E7D32] dark:text-[#4CAF50] font-semibold">
                Request sent! We&apos;ll be in touch shortly.
              </p>
            </div>
          ) : (
            <Button
              variant="primary"
              className="w-full"
              size="lg"
              icon={Mail}
              onClick={handleUpgrade}
            >
              Request access to {targetPlan.name} — ₹{billing === 'annual' ? targetPlan.annual?.toLocaleString('en-IN') + '/yr' : targetPlan.price?.toLocaleString('en-IN') + '/mo'}
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
