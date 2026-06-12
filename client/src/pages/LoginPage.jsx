import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Moon, Sun, ArrowRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { ErrorBanner } from '../components/ui';
import { LedgerStrip } from '../components/ui';
import { useTheme } from '../context/ThemeContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

/* ─── Editorial floating-label input ──────────────────────────────────────────
   Carta-flavored: ultra-thin hairline border, monochrome focus, no halo. */
function FloatingInput({ id, label, type = 'text', value, onChange, required, autoComplete, rightSlot }) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        placeholder=" "
        className={[
          'peer w-full h-14 px-4 pt-5 pb-1.5 text-sm font-medium',
          'bg-paper-card dark:bg-ink-card',
          'text-ink dark:text-paper',
          'border border-paper-rule dark:border-ink-rule rounded-btn',
          'outline-none transition-all duration-200 ease-carta',
          'focus:border-ink dark:focus:border-paper',
          'focus:shadow-[inset_0_0_0_1px_#1A1A1A] dark:focus:shadow-[inset_0_0_0_1px_#F1F1F1]',
          'placeholder:text-transparent',
          rightSlot ? 'pr-11' : '',
        ].join(' ')}
      />
      <label
        htmlFor={id}
        className={[
          'absolute left-4 top-4 text-sm leading-none pointer-events-none',
          'text-ink/50 dark:text-paper/50',
          'transition-all duration-200 ease-carta origin-top-left',
          'peer-focus:-translate-y-2.5 peer-focus:scale-75 peer-focus:text-ink dark:peer-focus:text-paper peer-focus:font-semibold',
          'peer-[:not(:placeholder-shown)]:-translate-y-2.5 peer-[:not(:placeholder-shown)]:scale-75 peer-[:not(:placeholder-shown)]:font-semibold',
          'px-0.5',
        ].join(' ')}
      >
        {label}
      </label>
      {/* Notch behind raised label */}
      <span
        aria-hidden="true"
        className={[
          'absolute left-[14px] top-0 h-px bg-paper-card dark:bg-ink-card',
          'transition-all duration-200 ease-carta',
          'peer-focus:w-[calc(100%-28px)] peer-[:not(:placeholder-shown)]:w-[calc(100%-28px)]',
          'w-0',
        ].join(' ')}
        style={{ maxWidth: 'calc(100% - 28px)' }}
      />
      {rightSlot && (
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { login, register } = useContext(AuthContext);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(name, email, password);
        toast.success(t('auth.welcomeAboard', { name: name || 'there' }));
      } else {
        await login(email, password);
        toast.success(t('auth.welcomeBack'));
      }
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.message || t('auth.authFailed');
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className="bg-login min-h-screen w-full flex flex-col relative overflow-hidden">
      {/* Top bar */}
      <header className="relative flex items-center justify-between px-6 pt-6 z-10">
        {/* Brand wordmark — Fraunces serif lockup */}
        <div className="flex flex-col">
          <span className="font-display text-[26px] font-normal tracking-tight leading-none text-ink dark:text-paper">
            SmartStock
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] mt-1 leading-none text-ink/50 dark:text-paper/50">
            STOCK LEDGER
          </span>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t('common.themeLight') : t('common.themeDark')}
            className="w-10 h-10 rounded-btn flex items-center justify-center bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule text-ink/70 dark:text-paper/70 hover:border-ink dark:hover:border-paper hover:text-ink dark:hover:text-paper transition-all duration-200 ease-carta"
          >
            {isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
          </button>
        </div>
      </header>

      {/* Centered card */}
      <main className="relative flex-1 flex items-center justify-center px-4 py-10 z-10">
        <div className="w-full max-w-[440px]">
          {/* Editorial kicker rule above title */}
          <div className="mb-8 px-1">
            <div className="ledger-rule w-12 mb-5" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/60 dark:text-paper/60 mb-3">
              {t('auth.kicker')}
            </p>
            <h1 className="font-display text-[44px] leading-[1.05] tracking-editorial font-normal text-ink dark:text-paper">
              {isRegister ? t('auth.registerHero') : t('auth.loginHero')}
            </h1>
            <p className="mt-3 text-sm text-ink/60 dark:text-paper/60 leading-relaxed max-w-sm">
              {isRegister
                ? t('auth.registerSub', { defaultValue: 'Set up your store ledger in under five minutes.' })
                : t('auth.loginSub',    { defaultValue: 'Sign in to your store ledger.' })}
            </p>
          </div>

          {/* Card */}
          <div className="bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-btn px-7 pt-7 pb-7 transition-all duration-200 ease-carta hover:border-ink/30 dark:hover:border-paper/30">
            {error && (
              <div className="mb-5">
                <ErrorBanner message={error} onDismiss={() => setError('')} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <FloatingInput
                  id="name"
                  label={t('auth.fullName')}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              )}

              <FloatingInput
                id="email"
                label={t('auth.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <FloatingInput
                id="password"
                label={t('auth.password')}
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    aria-label={showPass ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="text-ink/50 dark:text-paper/50 hover:text-ink dark:hover:text-paper transition-colors duration-200 ease-carta"
                  >
                    {showPass ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                }
              />

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="group w-full h-12 text-sm font-medium rounded-btn px-6 inline-flex items-center justify-center gap-2 bg-ink text-paper shadow-[inset_0_0_0_2px_#1A1A1A] hover:bg-paper hover:text-ink dark:bg-paper dark:text-ink dark:shadow-[inset_0_0_0_2px_#F1F1F1] dark:hover:bg-ink dark:hover:text-paper disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 ease-carta active:translate-y-px"
                >
                  <span>
                    {submitting
                      ? (isRegister ? t('auth.creatingAccount') : t('auth.signingIn'))
                      : (isRegister ? t('auth.createAccount') : t('auth.signIn'))}
                  </span>
                  {!submitting && (
                    <ArrowRight size={15} className="transition-transform duration-200 ease-carta group-hover:translate-x-1" />
                  )}
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <div className="flex-1 h-px bg-paper-rule dark:bg-ink-rule" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40 dark:text-paper/40">
                {t('auth.or', { defaultValue: 'or' })}
              </span>
              <div className="flex-1 h-px bg-paper-rule dark:bg-ink-rule" />
            </div>

            <p className="text-center text-sm text-ink/60 dark:text-paper/60">
              {isRegister ? t('auth.haveAccount') : t('auth.newHere')}{' '}
              <button
                type="button"
                onClick={() => { setIsRegister(r => !r); setError(''); }}
                className="font-semibold text-ink dark:text-paper underline underline-offset-4 decoration-1 hover:decoration-2 transition-all duration-200 ease-carta"
              >
                {isRegister ? t('auth.signIn') : t('auth.signUp')}
              </button>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 pb-6 flex justify-center">
        <LedgerStrip meta={['SmartStock', 'v.2.4', 'FY 25–26', '₹ INR']} />
      </footer>
    </div>
  );
}
