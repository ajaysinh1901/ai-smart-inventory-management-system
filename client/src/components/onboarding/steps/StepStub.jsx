/**
 * StepStub — placeholder for steps 4–7 while backend schema is being built.
 * Renders title, description, and a disabled "Coming next" button.
 * Step indicator still progresses so UX testers can walk all 7 steps.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

export default function StepStub({ stepNumber, titleKey, descKey, icon: Icon }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center py-6 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/8 dark:bg-primary-soft/12 border border-primary/15 dark:border-primary-soft/20 flex items-center justify-center">
        {Icon ? (
          <Icon size={28} className="text-primary/60 dark:text-primary-soft/80" />
        ) : (
          <Clock size={28} className="text-primary/60 dark:text-primary-soft/80" />
        )}
      </div>

      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-base font-semibold text-ink dark:text-paper">
          {t(titleKey)}
        </h3>
        <p className="text-sm text-ink/50 dark:text-paper/50 leading-relaxed">
          {t(descKey)}
        </p>
      </div>

      <div className="mt-2 px-4 py-2 rounded-xl border border-dashed border-primary/30 dark:border-primary-soft/35 bg-primary/4 dark:bg-primary-soft/10 text-primary/60 dark:text-primary-soft/80 text-xs font-semibold flex items-center gap-2">
        <Clock size={13} />
        {t('onboarding.stub.comingNext')}
      </div>

      <p className="text-xs text-ink/30 dark:text-paper/30 max-w-xs">
        {t('onboarding.stub.unblockNote')}
      </p>
    </div>
  );
}
