/**
 * Step 1 — Welcome & Profile
 *
 * Captures: store name, store type, storeProfile (small/big),
 *           language, state (with GST state code).
 *
 * Cannot be skipped per spec C.2.
 * Hides "fiscal year start" for small profile per C.4.
 */
import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Store, Building2, ShoppingBag, Pill, Utensils, Package, ChevronDown, Globe } from 'lucide-react';
import { Input } from '../../ui';
import { SUPPORTED_LANGS } from '../../../i18n';
import i18n from '../../../i18n';

// All 28 states + 8 UTs with GST state codes
export const INDIAN_STATES = [
  { name: 'Andhra Pradesh',                             code: '37' },
  { name: 'Arunachal Pradesh',                          code: '12' },
  { name: 'Assam',                                      code: '18' },
  { name: 'Bihar',                                      code: '10' },
  { name: 'Chhattisgarh',                               code: '22' },
  { name: 'Goa',                                        code: '30' },
  { name: 'Gujarat',                                    code: '24' },
  { name: 'Haryana',                                    code: '06' },
  { name: 'Himachal Pradesh',                           code: '02' },
  { name: 'Jharkhand',                                  code: '20' },
  { name: 'Karnataka',                                  code: '29' },
  { name: 'Kerala',                                     code: '32' },
  { name: 'Madhya Pradesh',                             code: '23' },
  { name: 'Maharashtra',                                code: '27' },
  { name: 'Manipur',                                    code: '14' },
  { name: 'Meghalaya',                                  code: '17' },
  { name: 'Mizoram',                                    code: '15' },
  { name: 'Nagaland',                                   code: '13' },
  { name: 'Odisha',                                     code: '21' },
  { name: 'Punjab',                                     code: '03' },
  { name: 'Rajasthan',                                  code: '08' },
  { name: 'Sikkim',                                     code: '11' },
  { name: 'Tamil Nadu',                                 code: '33' },
  { name: 'Telangana',                                  code: '36' },
  { name: 'Tripura',                                    code: '16' },
  { name: 'Uttar Pradesh',                              code: '09' },
  { name: 'Uttarakhand',                                code: '05' },
  { name: 'West Bengal',                                code: '19' },
  // Union Territories
  { name: 'Andaman and Nicobar Islands',                code: '35' },
  { name: 'Chandigarh',                                 code: '04' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu',   code: '26' },
  { name: 'Delhi',                                      code: '07' },
  { name: 'Jammu and Kashmir',                          code: '01' },
  { name: 'Ladakh',                                     code: '38' },
  { name: 'Lakshadweep',                                code: '31' },
  { name: 'Puducherry',                                 code: '34' },
];

const STORE_TYPES = [
  { id: 'kirana',    icon: Store,      labelKey: 'onboarding.step1.typeKirana' },
  { id: 'pharmacy',  icon: Pill,       labelKey: 'onboarding.step1.typePharmacy' },
  { id: 'general',   icon: ShoppingBag,labelKey: 'onboarding.step1.typeGeneral' },
  { id: 'wholesale', icon: Building2,  labelKey: 'onboarding.step1.typeWholesale' },
  { id: 'restaurant',icon: Utensils,   labelKey: 'onboarding.step1.typeRestaurant' },
  { id: 'other',     icon: Package,    labelKey: 'onboarding.step1.typeOther' },
];

export default function Step1Profile({ data, onChange, errors }) {
  const { t } = useTranslation();
  const [stateSearch, setStateSearch] = useState(data.state || '');
  const [showStateDD, setShowStateDD] = useState(false);
  const stateRef = useRef(null);

  const filteredStates = INDIAN_STATES.filter(s =>
    s.name.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const handleStateSelect = (stateName, stateCode) => {
    onChange({ state: stateName, gstStateCode: stateCode });
    setStateSearch(stateName);
    setShowStateDD(false);
  };

  const handleLanguageChange = (code) => {
    onChange({ language: code });
    i18n.changeLanguage(code);
  };

  return (
    <div className="space-y-5">
      {/* Store name */}
      <Input
        label={t('onboarding.step1.storeName')}
        required
        value={data.storeName || ''}
        onChange={e => onChange({ storeName: e.target.value })}
        error={errors?.storeName}
        placeholder={t('onboarding.step1.storeNamePlaceholder')}
        autoFocus
      />

      {/* Store type */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-ink/60 dark:text-paper/60 block uppercase tracking-[0.14em]">
          {t('onboarding.step1.storeType')} <span className="text-ink/60 dark:text-paper/60 ml-0.5 font-display">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STORE_TYPES.map(({ id, icon: Icon, labelKey }) => {
            const active = data.storeType === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ storeType: id })}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                  active
                    ? 'border-ink dark:border-paper bg-paper-soft dark:bg-ink-soft text-ink dark:text-paper shadow-[inset_0_0_0_1px_#1A1A1A] dark:shadow-[inset_0_0_0_1px_#F1F1F1]'
                    : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/70 dark:text-paper/70 hover:border-ink/50 dark:hover:border-paper/50 hover:bg-paper-soft/60 dark:hover:bg-ink-soft/60'
                }`}
              >
                <Icon size={15} className={active ? 'text-ink dark:text-paper' : 'text-ink/40 dark:text-paper/40'} />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
        {errors?.storeType && (
          <p className="text-xs text-coral-deep dark:text-coral-soft font-medium">{errors.storeType}</p>
        )}
      </div>

      {/* Store profile: small vs big */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-ink/60 dark:text-paper/60 block uppercase tracking-[0.14em]">
          {t('onboarding.step1.storeProfile')} <span className="text-ink/60 dark:text-paper/60 ml-0.5 font-display">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Small */}
          <button
            type="button"
            onClick={() => onChange({ storeProfile: 'small' })}
            className={`flex flex-col gap-1.5 px-4 py-3 rounded-xl border text-left transition-all ${
              data.storeProfile === 'small'
                ? 'border-ink dark:border-paper bg-paper-soft dark:bg-ink-soft shadow-[inset_0_0_0_1px_#1A1A1A] dark:shadow-[inset_0_0_0_1px_#F1F1F1]'
                : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card hover:border-ink/50 dark:hover:border-paper/50 hover:bg-paper-soft/60 dark:hover:bg-ink-soft/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🏪</span>
              <span className={`text-sm font-semibold ${data.storeProfile === 'small' ? 'text-ink dark:text-paper font-display tracking-tightish' : 'text-ink dark:text-paper'}`}>
                {t('onboarding.step1.profileSmall')}
              </span>
            </div>
            <p className="text-xs text-ink/50 dark:text-paper/50 leading-relaxed">
              {t('onboarding.step1.profileSmallDesc')}
            </p>
          </button>
          {/* Big */}
          <button
            type="button"
            onClick={() => onChange({ storeProfile: 'big' })}
            className={`flex flex-col gap-1.5 px-4 py-3 rounded-xl border text-left transition-all ${
              data.storeProfile === 'big'
                ? 'border-ink dark:border-paper bg-paper-soft dark:bg-ink-soft shadow-[inset_0_0_0_1px_#1A1A1A] dark:shadow-[inset_0_0_0_1px_#F1F1F1]'
                : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card hover:border-ink/50 dark:hover:border-paper/50 hover:bg-paper-soft/60 dark:hover:bg-ink-soft/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🏬</span>
              <span className={`text-sm font-semibold ${data.storeProfile === 'big' ? 'text-primary dark:text-primary-soft' : 'text-ink dark:text-paper'}`}>
                {t('onboarding.step1.profileBig')}
              </span>
            </div>
            <p className="text-xs text-ink/50 dark:text-paper/50 leading-relaxed">
              {t('onboarding.step1.profileBigDesc')}
            </p>
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-ink/60 dark:text-paper/60 block uppercase tracking-[0.14em]">
          <Globe size={12} className="inline mr-1 opacity-60" />
          {t('onboarding.step1.language')}
        </label>
        <div className="flex gap-2 flex-wrap">
          {SUPPORTED_LANGS.map(lang => {
            const active = (data.language || 'en') === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageChange(lang.code)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  active
                    ? 'border-ink dark:border-paper bg-paper-soft dark:bg-ink-soft text-ink dark:text-paper shadow-[inset_0_0_0_1px_#1A1A1A] dark:shadow-[inset_0_0_0_1px_#F1F1F1]'
                    : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/70 dark:text-paper/70 hover:border-ink/50 dark:hover:border-paper/50'
                }`}
              >
                {lang.native}
              </button>
            );
          })}
        </div>
      </div>

      {/* State dropdown */}
      <div className="relative" ref={stateRef}>
        <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block mb-1.5">
          {t('onboarding.step1.state')} <span className="text-ink/60 dark:text-paper/60 ml-0.5 font-display">*</span>
        </label>
        <div className="relative">
          <input
            value={stateSearch}
            onChange={e => { setStateSearch(e.target.value); setShowStateDD(true); onChange({ state: '', gstStateCode: '' }); }}
            onFocus={() => setShowStateDD(true)}
            onBlur={() => setTimeout(() => setShowStateDD(false), 200)}
            placeholder={t('onboarding.step1.statePlaceholder')}
            className={`w-full pl-3.5 pr-9 h-10 border rounded-xl text-sm text-ink dark:text-paper placeholder:text-ink/30 dark:placeholder:text-paper/30 outline-none transition-all bg-paper-card dark:bg-ink-card focus:ring-2 focus:ring-ink/15 dark:focus:ring-paper/15 focus:border-ink dark:focus:border-paper ${
              errors?.state ? 'border-coral dark:border-coral-soft' : 'border-paper-rule dark:border-ink-rule'
            }`}
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40 pointer-events-none" />
        </div>
        {errors?.state && (
          <p className="text-xs text-coral-deep dark:text-coral-soft font-medium mt-1">{errors.state}</p>
        )}
        {showStateDD && filteredStates.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl shadow-lg max-h-44 overflow-y-auto scrollbar-thin">
            {filteredStates.map(s => (
              <button
                key={s.code}
                type="button"
                onMouseDown={e => { e.preventDefault(); handleStateSelect(s.name, s.code); }}
                className="w-full text-left px-3 py-2 text-sm text-ink/70 dark:text-paper/70 hover:bg-paper-soft dark:hover:bg-ink-soft hover:text-ink dark:hover:text-paper transition-colors flex items-center justify-between"
              >
                <span>{s.name}</span>
                <span className="font-mono text-xs text-ink/30 dark:text-paper/30">{s.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fiscal year start — only shown for big profile per C.4 */}
      {data.storeProfile === 'big' && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink/60 dark:text-paper/60 block uppercase tracking-[0.14em]">
            {t('onboarding.step1.fyStart')}
          </label>
          <div className="flex gap-2">
            {[
              { label: t('onboarding.step1.fyApr'), value: '04-01' },
              { label: t('onboarding.step1.fyJan'), value: '01-01' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ fyStart: opt.value })}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                  (data.fyStart || '04-01') === opt.value
                    ? 'border-ink dark:border-paper bg-paper-soft dark:bg-ink-soft text-ink dark:text-paper shadow-[inset_0_0_0_1px_#1A1A1A] dark:shadow-[inset_0_0_0_1px_#F1F1F1]'
                    : 'border-paper-rule dark:border-ink-rule bg-paper-card dark:bg-ink-card text-ink/70 dark:text-paper/70 hover:border-ink/50 dark:hover:border-paper/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
