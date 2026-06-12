import React, { useState, useEffect, useContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { getSettings, updateSettings, updatePassword, patchWorkspace } from '../services/settingsService';
import { updateMe, getUsers, updateUserRole, deleteUser } from '../services/userService';
import { SUPPORTED_LANGS } from '../i18n';
import {
  User, Building2, Puzzle, BellRing, CreditCard, Users,
  CircleUser, CheckCircle, Lock, Palette, SlidersHorizontal,
  Cable, Webhook, Bell, Smartphone, Mail,
  MessageSquare, ShoppingCart, Database, Plus, UserPlus, Shield, Check,
  Trash2, Settings, Send, AlertTriangle, Eye, EyeOff, Sparkles, Info,
  FileText, Languages,
} from 'lucide-react';
import { Button, Input, Textarea, PageHeader, Skeleton, Select } from '../components/ui';

// Role gates mirror server/src/routes/v1/*.routes.js. The 'users' tab calls
// /users which is `router.use(authorize('admin'))` — admin only.
const NAV_ITEMS = [
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'workspace', icon: Building2, label: 'Workspace' },
  { id: 'ai-config', icon: SlidersHorizontal, label: 'AI Configuration' },
  { id: 'integrations', icon: Puzzle, label: 'Integrations' },
  { id: 'notifications', icon: BellRing, label: 'Notifications' },
  { id: 'billing', icon: CreditCard, label: 'Billing & Plan' },
  { id: 'users', icon: Users, label: 'User Management', roles: ['admin'] },
];

const Card = ({ children, className = '' }) => (
  <div className={`bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-6 ${className}`}>{children}</div>
);

const SectionHeader = ({ icon, title, badge }) => (
  <div className="flex items-center justify-between mb-6">
    <h2 className="text-lg font-display font-semibold text-ink dark:text-paper flex items-center gap-2.5 tracking-tight">
      {icon}
      {title}
    </h2>
    {badge}
  </div>
);

const Toggle = ({ checked = false, onChange, label, sub }) => (
  <div className="flex items-center justify-between p-4 bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule">
    <div>
      <p className="text-sm font-bold text-ink dark:text-paper">{label}</p>
      {sub && <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">{sub}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-paper-rule dark:bg-ink-rule'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

// Password input with show/hide toggle. Built on top of the shared Input.
const PasswordInput = ({ value, onChange, onBlur, label, error, helperText, placeholder, required }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-ink/70 dark:text-paper/70 block">
        {label}{required && <span className="text-primary ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`w-full pl-3.5 pr-10 h-10 border rounded-xl text-sm text-ink dark:text-paper placeholder:text-ink/30 dark:placeholder:text-paper/30 outline-none transition-all bg-paper-card dark:bg-ink-card focus:ring-4 ${
            error
              ? 'border-primary/50 focus:ring-primary/20 focus:border-primary'
              : 'border-paper-rule dark:border-ink-rule hover:border-paper-rule/80 dark:hover:border-ink-rule/80 focus:ring-primary/25 focus:border-primary'
          }`}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink/40 dark:text-paper/40 hover:text-ink/70 dark:hover:text-paper/70 transition-colors rounded-lg hover:bg-paper dark:hover:bg-ink"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-primary font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-ink/50 dark:text-paper/50">{helperText}</p>
      ) : null}
    </div>
  );
};

// Password strength meter — purely client-side hint, server still enforces length.
const passwordStrength = (pw) => {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['bg-primary', 'bg-primary', 'bg-brass-soft', 'bg-brass', 'bg-[#2E7D32]', 'bg-[#2E7D32]'];
  return { score, label: labels[score], color: colors[score] };
};


// ─── LANGUAGE PREFERENCE CARD ─────────────────────────────────────────────────
function LanguageCard() {
  const { i18n, t } = useTranslation();
  const current = i18n.language || 'en';
  return (
    <Card>
      <SectionHeader icon={<Languages size={20} className="text-primary" />} title={t('settings.language')} />
      <p className="text-xs text-ink/50 dark:text-paper/50 mb-4">{t('settings.languageDesc')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SUPPORTED_LANGS.map((lang) => {
          const active = lang.code === current;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => i18n.changeLanguage(lang.code)}
              className={`p-4 rounded-xl border-2 text-left relative transition-all ${
                active
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-paper-rule dark:border-ink-rule hover:border-primary/40'
              }`}
            >
              {active && <CheckCircle size={18} className="absolute top-2 right-2 text-primary" />}
              <p className="font-display font-semibold text-base text-ink dark:text-paper">{lang.native}</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] mt-1 text-ink/50 dark:text-paper/50">{lang.label}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function ProfileSection({ user, setUser, settings, saveSettings }) {
  const { toast } = useToast();
  const initialised = useRef(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [jobTitle, setJobTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwTouched, setPwTouched] = useState({});
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ text: '', type: '' });

  // Initialise jobTitle from settings exactly once. Re-running on every
  // settings update would clobber the user's mid-edit input.
  useEffect(() => {
    if (settings && !initialised.current) {
      setJobTitle(settings.profile?.jobTitle || '');
      initialised.current = true;
    }
  }, [settings]);

  const profileErrors = {
    name: !name?.trim() ? 'Name is required.' : '',
    email: !email?.trim()
      ? 'Email is required.'
      : !/^\S+@\S+\.\S+$/.test(email)
        ? 'Enter a valid email address.'
        : '',
  };
  const isProfileValid = !profileErrors.name && !profileErrors.email;
  const dirty = (name !== (user?.name || '')) || (email !== (user?.email || '')) || (jobTitle !== (settings?.profile?.jobTitle || ''));

  const save = async () => {
    setTouched({ name: true, email: true });
    if (!isProfileValid) return;
    setSaving(true);
    try {
      // Two endpoints because name/email live on User and jobTitle on Settings.
      const [meRes] = await Promise.all([
        updateMe({ name: name.trim(), email: email.trim() }),
        saveSettings('profile', { jobTitle }, { silent: true }),
      ]);
      if (meRes?.data?.data) setUser(meRes.data.data);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      toast.success('Profile saved.');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save profile.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const pwErrors = {
    currentPassword: !currentPassword ? 'Current password is required.' : '',
    newPassword: !newPassword
      ? 'New password is required.'
      : newPassword.length < 6
        ? 'Password must be at least 6 characters.'
        : newPassword === currentPassword
          ? 'New password must differ from current.'
          : '',
    confirmPassword: !confirmPassword
      ? 'Please confirm your new password.'
      : confirmPassword !== newPassword
        ? 'Passwords do not match.'
        : '',
  };
  const isPwValid = !pwErrors.currentPassword && !pwErrors.newPassword && !pwErrors.confirmPassword;
  const strength = passwordStrength(newPassword);

  const handlePasswordChange = async () => {
    setPwTouched({ currentPassword: true, newPassword: true, confirmPassword: true });
    if (!isPwValid) return;
    setPwSaving(true); setPwMsg({ text: '', type: '' });
    try {
      await updatePassword({ currentPassword, newPassword });
      setPwMsg({ text: 'Password updated successfully!', type: 'success' });
      toast.success('Password updated successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPwTouched({});
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update password.';
      setPwMsg({ text: msg, type: 'error' });
      toast.error(msg);
    } finally {
      setPwSaving(false);
    }
  };

  const initials = (name || user?.email || '?').split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader icon={<CircleUser size={20} className="text-primary" />} title="Public Profile" />
        <div className="flex flex-col md:flex-row gap-8">
          <div className="relative flex-shrink-0">
            <div
              className="w-24 h-24 rounded-xl bg-brass flex items-center justify-center text-2xl font-mono font-bold text-ink shadow-sm border border-brass-deep/20"
              aria-label={`Avatar for ${name || 'user'}`}
            >
              {initials}
            </div>
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, name: true }))}
              error={touched.name ? profileErrors.name : ''}
            />
            <Input
              label="Email Address"
              required
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, email: true }))}
              error={touched.email ? profileErrors.email : ''}
              helperText={!touched.email && email !== (user?.email || '') ? 'Changing email will not change your login until verified.' : ''}
            />
            <div className="md:col-span-2">
              <Input
                label="Job Title / Role"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Inventory Manager, Owner, Accountant"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end items-center gap-4">
          {saved && <span className="text-[#2E7D32] font-semibold text-sm flex items-center gap-1"><CheckCircle size={16} /> Saved!</span>}
          {dirty && !saved && <span className="text-brass-deep dark:text-brass text-xs font-medium">Unsaved changes</span>}
          <Button
            variant="primary"
            size="lg"
            loading={saving}
            disabled={saving || !isProfileValid || !dirty}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </Card>
      <Card>
        <SectionHeader icon={<Lock size={20} className="text-primary" />} title="Change Password" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PasswordInput
            label="Current Password"
            required
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            onBlur={() => setPwTouched(t => ({ ...t, currentPassword: true }))}
            error={pwTouched.currentPassword ? pwErrors.currentPassword : ''}
            placeholder="••••••••"
          />
          <PasswordInput
            label="New Password"
            required
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            onBlur={() => setPwTouched(t => ({ ...t, newPassword: true }))}
            error={pwTouched.newPassword ? pwErrors.newPassword : ''}
            placeholder="••••••••"
            helperText={!pwTouched.newPassword ? 'At least 6 characters.' : ''}
          />
          <PasswordInput
            label="Confirm Password"
            required
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onBlur={() => setPwTouched(t => ({ ...t, confirmPassword: true }))}
            error={pwTouched.confirmPassword ? pwErrors.confirmPassword : ''}
            placeholder="••••••••"
          />
        </div>
        {newPassword && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-ink/40 dark:text-paper/40 uppercase tracking-wider">Strength</span>
              <span className="text-[11px] font-bold text-ink dark:text-paper">{strength.label}</span>
            </div>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(i => (
                <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength.score ? strength.color : 'bg-paper-rule dark:bg-ink-rule'}`} />
              ))}
            </div>
          </div>
        )}
        {pwMsg.text && (
          <p className={`mt-3 text-sm font-semibold ${pwMsg.type === 'error' ? 'text-primary' : 'text-[#2E7D32]'}`}>{pwMsg.text}</p>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="lg"
            loading={pwSaving}
            disabled={pwSaving || !isPwValid}
            onClick={handlePasswordChange}
          >
            {pwSaving ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </Card>
      <LanguageCard />
    </div>
  );
}

// ─── WORKSPACE ────────────────────────────────────────────────────────────────
const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Australia/Sydney', 'UTC',
];

const INDUSTRIES = [
  'Retail', 'Wholesale', 'Manufacturing', 'Pharmacy',
  'Grocery', 'Electronics', 'Apparel', 'Restaurant', 'Other',
];

function WorkspaceSection({ settings, saveSettings }) {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const initialised = useRef(false);
  const themeAtMount = useRef(theme);
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [description, setDescription] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [darkMode, setDarkModeLocal] = useState(theme === 'dark');
  const [compactView, setCompactView] = useState(true);
  const [showStockAlerts, setShowStockAlerts] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});

  // Init only once. Subsequent settings refreshes (e.g. after save) shouldn't
  // overwrite the user's in-flight edits.
  useEffect(() => {
    if (settings && !initialised.current) {
      const w = settings.workspace || {};
      const p = settings.preferences || {};
      setCompanyName(w.companyName || '');
      setIndustry(w.industry || '');
      setWebsite(w.website || '');
      setTimezone(w.timezone || 'Asia/Kolkata');
      setDescription(w.description || '');
      setGstin(w.gstin || '');
      setAddress(w.address || '');
      setStateName(w.state || '');
      setPinCode(w.pinCode || '');
      setUpiId(w.upiId || '');
      setPayeeName(w.payeeName || '');
      setCompactView(p.compactView !== false);
      setShowStockAlerts(p.showStockAlerts !== false);
      // Preference dark mode follows the saved value but doesn't fight the
      // current visual theme — that's owned by the global ThemeContext.
      setDarkModeLocal(theme === 'dark');
      initialised.current = true;
    }
  }, [settings, theme]);

  // If the user toggled dark mode but never saved, revert when leaving.
  useEffect(() => () => {
    setTheme(themeAtMount.current);
  }, [setTheme]);

  const websiteError = website && !/^https?:\/\/.+\..+/.test(website) ? 'Use a full URL like https://example.com' : '';
  // VPA shape mirrors the server check so we don't even POST a malformed value.
  const upiError = upiId.trim() && !/^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim())
    ? 'Use format like merchant@upi or 9876543210@ybl'
    : '';
  const gstinError = gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase())
    ? 'Must be 15 chars, e.g. 22AAAAA0000A1Z5'
    : '';
  const pinError = pinCode.trim() && !/^[1-9][0-9]{5}$/.test(pinCode.trim())
    ? 'Indian PIN code must be 6 digits.'
    : '';
  const isValid = !!companyName?.trim() && !websiteError && !upiError && !gstinError && !pinError;
  const dirty = !!settings && (
    companyName !== (settings.workspace?.companyName || '') ||
    industry !== (settings.workspace?.industry || '') ||
    website !== (settings.workspace?.website || '') ||
    timezone !== (settings.workspace?.timezone || 'Asia/Kolkata') ||
    description !== (settings.workspace?.description || '') ||
    gstin !== (settings.workspace?.gstin || '') ||
    address !== (settings.workspace?.address || '') ||
    stateName !== (settings.workspace?.state || '') ||
    pinCode !== (settings.workspace?.pinCode || '') ||
    upiId !== (settings.workspace?.upiId || '') ||
    payeeName !== (settings.workspace?.payeeName || '') ||
    darkMode !== (theme === 'dark') ||
    compactView !== (settings.preferences?.compactView !== false) ||
    showStockAlerts !== (settings.preferences?.showStockAlerts !== false)
  );

  const save = async () => {
    setTouched({ companyName: true, website: true, upiId: true, gstin: true, pinCode: true });
    if (!isValid) return;
    setSaving(true);
    try {
      // Split into two calls:
      // 1. PATCH /workspace — handles all workspace/invoice fields (GSTIN, UPI, state, etc.)
      //    The workspace validator covers all these fields; PUT /settings validator does NOT.
      // 2. PUT /settings with preferences — dark mode, compact view, stock alerts.
      const workspaceBody = {
        companyName: companyName.trim(),
        industry,
        website: website.trim(),
        timezone,
        description,
        gstin: gstin.trim().toUpperCase(),
        address: address.trim(),
        state: stateName.trim(),
        pinCode: pinCode.trim(),
        upiId: upiId.trim(),
        payeeName: payeeName.trim(),
      };
      await patchWorkspace(workspaceBody);
      await saveSettings('preferences', { darkMode, compactView, showStockAlerts });
      // Lock in theme and update the "mount" reference so the unmount-revert
      // doesn't undo a successful save.
      setTheme(darkMode ? 'dark' : 'light');
      themeAtMount.current = darkMode ? 'dark' : 'light';
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      toast.success('Workspace updated.');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to update workspace.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader icon={<Building2 size={20} className="text-primary" />} title="Workspace Details" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Company Name"
            required
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, companyName: true }))}
            error={touched.companyName && !companyName.trim() ? 'Company name is required.' : ''}
          />
          <Select label="Industry" value={industry} onChange={e => setIndustry(e.target.value)}>
            <option value="">— Select —</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </Select>
          <Input
            label="Website"
            type="url"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, website: true }))}
            error={touched.website ? websiteError : ''}
            placeholder="https://example.com"
          />
          <Select label="Timezone" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
          <div className="md:col-span-2">
            <Textarea
              label="Company Description"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              helperText={`${description.length}/500`}
            />
          </div>
        </div>
      </Card>
      <Card>
        <SectionHeader
          icon={<FileText size={20} className="text-primary" />}
          title="Seller Details (Tax Invoice)"
          badge={
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
              ON INVOICE
            </span>
          }
        />
        <p className="text-xs text-ink/50 dark:text-paper/50 mb-4">
          Printed on every tax invoice and used as the place-of-supply reference for CGST/SGST vs IGST.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="GSTIN"
            value={gstin}
            onChange={e => setGstin(e.target.value.toUpperCase())}
            onBlur={() => setTouched(t => ({ ...t, gstin: true }))}
            error={touched.gstin ? gstinError : ''}
            placeholder="22AAAAA0000A1Z5"
            className="font-mono uppercase"
            maxLength={15}
          />
          <Select label="State (Place of Supply)" value={stateName} onChange={e => setStateName(e.target.value)}>
            <option value="">— Select —</option>
            {[
              'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
              'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
              'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
              'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
              'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry',
              'Chandigarh', 'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu',
              'Lakshadweep',
            ].map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <div className="md:col-span-2">
            <Textarea
              label="Registered Address"
              rows={2}
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Shop number, building, street, city"
            />
          </div>
          <Input
            label="PIN Code"
            value={pinCode}
            onChange={e => setPinCode(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => setTouched(t => ({ ...t, pinCode: true }))}
            error={touched.pinCode ? pinError : ''}
            placeholder="380015"
            maxLength={6}
            className="font-mono"
          />
        </div>
      </Card>
      <Card>
        <SectionHeader
          icon={<CreditCard size={20} className="text-primary" />}
          title="UPI Payment Collection"
          badge={
            <span className="text-[10px] font-bold text-[#2E7D32] dark:text-[#4CAF50] bg-[#2E7D32]/10 px-2 py-1 rounded-full border border-[#2E7D32]/30">
              ON INVOICE
            </span>
          }
        />
        <p className="text-xs text-ink/50 dark:text-paper/50 mb-4">
          When a UPI ID is set, every tax invoice renders a <strong>Scan to Pay</strong> QR for the
          exact invoice amount — works with PhonePe, GPay, Paytm and any UPI app.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="UPI ID (VPA)"
            value={upiId}
            onChange={e => setUpiId(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, upiId: true }))}
            error={touched.upiId ? upiError : ''}
            placeholder="merchant@upi"
            className="font-mono"
          />
          <Input
            label="Payee Name (as shown to payer)"
            value={payeeName}
            onChange={e => setPayeeName(e.target.value)}
            placeholder={companyName || 'Your business name'}
            helperText="Shown in the UPI app before the customer confirms payment."
          />
        </div>
      </Card>
      <Card>
        <SectionHeader icon={<Palette size={20} className="text-primary" />} title="Preferences" />
        <div className="space-y-3">
          <Toggle
            checked={darkMode}
            onChange={(val) => { setDarkModeLocal(val); setTheme(val ? 'dark' : 'light'); }}
            label="Dark Mode"
            sub="Switch the application to a dark color scheme. Preview applies immediately; saved on Update."
          />
          <Toggle checked={compactView} onChange={setCompactView} label="Compact View" sub="Show more data with reduced padding across tables" />
          <Toggle checked={showStockAlerts} onChange={setShowStockAlerts} label="Show Stock Alerts on Login" sub="Display critical stock warnings on Dashboard load" />
        </div>
      </Card>
      <div className="flex justify-end items-center gap-4">
        {saved && <span className="text-[#2E7D32] font-semibold text-sm flex items-center gap-1"><CheckCircle size={16} /> Saved!</span>}
        {dirty && !saved && <span className="text-brass-deep dark:text-brass text-xs font-medium">Unsaved changes</span>}
        <Button
          variant="primary"
          size="lg"
          loading={saving}
          disabled={saving || !isValid || !dirty}
          onClick={save}
        >
          {saving ? 'Updating…' : 'Update Workspace'}
        </Button>
      </div>
    </div>
  );
}

// ─── AI CONFIG ────────────────────────────────────────────────────────────────
function AiConfigSection({ settings, saveSettings }) {
  const { toast } = useToast();
  const initialised = useRef(false);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [sensitivity, setSensitivity] = useState(85);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [predictiveAlerts, setPredictiveAlerts] = useState(true);
  const [deadStockDetection, setDeadStockDetection] = useState(false);
  const [supplierPriceMonitoring, setSupplierPriceMonitoring] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Current active Gemini families (free tier supports 2.5/2.0 flash). Older
  // 1.5 IDs kept for users who have working API keys against them.
  const models = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Newest. Fast, free-tier friendly. Default.', tag: 'RECOMMENDED' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Stable, low-latency for real-time queries.' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', desc: 'Deep reasoning, larger context window.' },
  ];

  useEffect(() => {
    if (settings?.aiConfig && !initialised.current) {
      const a = settings.aiConfig;
      // Map legacy IDs forward so users never see a broken selection.
      const legacyMap = { 'gemini-flash': 'gemini-2.5-flash', 'gemini-pro': 'gemini-1.5-pro', 'gemini-1.5-flash': 'gemini-2.0-flash', 'legacy': 'gemini-2.5-flash' };
      const incoming = a.model || 'gemini-2.5-flash';
      setModel(legacyMap[incoming] || incoming);
      setSensitivity(a.sensitivity ?? 85);
      setAutoOptimize(a.autoOptimize !== false);
      setPredictiveAlerts(a.predictiveAlerts !== false);
      setDeadStockDetection(a.deadStockDetection || false);
      setSupplierPriceMonitoring(a.supplierPriceMonitoring !== false);
      initialised.current = true;
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    const ok = await saveSettings('aiConfig', { model, sensitivity, autoOptimize, predictiveAlerts, deadStockDetection, supplierPriceMonitoring });
    setSaving(false);
    if (ok) {
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      toast.success('AI configuration saved.');
    } else {
      toast.error('Failed to save AI configuration.');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader
          icon={<SlidersHorizontal size={20} className="text-primary" />}
          title="AI Intelligence Engine"
          badge={
            <span className="text-[10px] font-bold text-[#2E7D32] dark:text-[#4CAF50] flex items-center gap-1 bg-[#2E7D32]/10 px-2 py-1 rounded-full border border-[#2E7D32]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] animate-pulse inline-block" />SYSTEM OPTIMIZED
            </span>
          }
        />
        <div className="space-y-6">
          <div>
            <label className="text-sm font-bold text-ink/70 dark:text-paper/70 block mb-3">Core Model Selection</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {models.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={`p-4 rounded-xl border-2 text-left relative transition-all ${
                    model === m.id
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-paper-rule dark:border-ink-rule hover:border-primary/40'
                  }`}
                >
                  {model === m.id && <CheckCircle size={18} className="absolute top-2 right-2 text-primary" />}
                  {m.tag && (
                    <span className="absolute -top-2 left-3 text-[9px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">{m.tag}</span>
                  )}
                  <p className="font-bold text-sm text-ink dark:text-paper">{m.name}</p>
                  <p className="text-[10px] text-ink/50 dark:text-paper/50 mt-1">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-bold text-ink/70 dark:text-paper/70">Analysis Sensitivity</label>
              <span className="text-xs font-bold text-primary">{sensitivity}% — {sensitivity >= 80 ? 'High Precision' : sensitivity >= 60 ? 'Reliable' : 'Balanced'}</span>
            </div>
            <input
              type="range" min={20} max={100} value={sensitivity}
              onChange={e => setSensitivity(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary bg-paper-rule dark:bg-ink-rule"
            />
            <div className="flex justify-between text-[10px] text-ink/40 dark:text-paper/40 mt-2 font-bold">
              <span>BALANCED</span><span>RELIABLE</span><span>STRICT</span>
            </div>
          </div>
        </div>
      </Card>
      <Card>
        <SectionHeader icon={<Sparkles size={20} className="text-primary" />} title="Automation Settings" />
        <div className="space-y-3">
          <Toggle checked={autoOptimize} onChange={setAutoOptimize} label="Auto-Optimize Stock" sub="Automatically adjust reorder points based on demand trends" />
          <Toggle checked={predictiveAlerts} onChange={setPredictiveAlerts} label="Predictive Restocking Alerts" sub="Get AI-driven alerts before stock hits critical levels" />
          <Toggle checked={deadStockDetection} onChange={setDeadStockDetection} label="Dead Stock Detection" sub="Detect and flag items with zero movement in 60+ days" />
          <Toggle checked={supplierPriceMonitoring} onChange={setSupplierPriceMonitoring} label="Supplier Price Monitoring" sub="Alert when supplier costs deviate more than 10% from baseline" />
        </div>
        <div className="mt-4 flex justify-end items-center gap-4">
          {saved && <span className="text-[#2E7D32] font-semibold text-sm flex items-center gap-1"><CheckCircle size={16} /> Saved!</span>}
          <Button variant="primary" size="lg" loading={saving} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save AI Config'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── INTEGRATIONS (placeholder) ───────────────────────────────────────────────
function IntegrationsSection() {
  const iconMap = {
    storage: Database,
    shopping_cart: ShoppingCart,
    mail: Mail,
    groups: Users,
    account_balance: CreditCard,
    chat: MessageSquare,
  };
  const items = [
    { name: 'WhatsApp Business', iconKey: 'chat', connected: false, desc: 'Send invoices to customers via WhatsApp' },
    { name: 'Google Workspace', iconKey: 'mail', connected: false, desc: 'Drive, Sheets & Gmail integration' },
    { name: 'Shopify', iconKey: 'shopping_cart', connected: false, desc: 'E-commerce order automation' },
    { name: 'Tally / QuickBooks', iconKey: 'account_balance', connected: false, desc: 'Accounting & financial sync' },
    { name: 'Slack', iconKey: 'chat', connected: false, desc: 'Alert notifications to channels' },
    { name: 'SAP ERP', iconKey: 'storage', connected: false, desc: 'Enterprise resource planning sync' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-brass/8 dark:bg-brass/15 border border-brass/30 rounded-xl p-4 flex items-center gap-3 text-brass-deep dark:text-brass text-sm font-medium">
        <span className="flex-shrink-0 text-base leading-none">&#8252;</span>
        <span>Integrations are coming soon. Connect buttons below are previews — they don't sync data yet.</span>
      </div>
      <Card>
        <SectionHeader icon={<Cable size={20} className="text-primary" />} title="External Integrations" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(item => {
            const IconComp = iconMap[item.iconKey] || Database;
            return (
              <div
                key={item.name}
                className="flex items-center justify-between p-4 bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule transition-all opacity-80"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-paper-card dark:bg-ink-card border border-paper-rule dark:border-ink-rule rounded-xl flex items-center justify-center text-ink/40 dark:text-paper/40">
                    <IconComp size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink dark:text-paper">{item.name}</p>
                    <p className="text-[10px] text-ink/50 dark:text-paper/50">{item.desc}</p>
                    <p className="text-[10px] font-bold uppercase mt-0.5 text-ink/30 dark:text-paper/30">○ Coming Soon</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="text-ink/30 dark:text-paper/30 text-xs font-bold px-3 py-1.5 rounded-full border border-paper-rule dark:border-ink-rule cursor-not-allowed"
                >
                  CONNECT
                </button>
              </div>
            );
          })}
          <div className="flex items-center justify-center p-4 bg-paper dark:bg-ink rounded-xl border-2 border-dashed border-paper-rule dark:border-ink-rule gap-2 text-ink/40 dark:text-paper/40">
            <Plus size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">More Coming Soon</span>
          </div>
        </div>
      </Card>
      <Card>
        <SectionHeader icon={<Webhook size={20} className="text-primary" />} title="API Keys & Webhooks" />
        <div className="bg-paper dark:bg-ink rounded-xl border border-paper-rule dark:border-ink-rule p-6 text-center">
          <Webhook size={28} className="text-ink/20 dark:text-paper/20 mx-auto mb-2" />
          <p className="text-sm font-semibold text-ink dark:text-paper">No API keys generated yet.</p>
          <p className="text-xs text-ink/50 dark:text-paper/50 mt-1">Public API access is on the roadmap. Contact support for early access.</p>
        </div>
      </Card>
    </div>
  );
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
function NotificationsSection({ settings, saveSettings }) {
  const { toast } = useToast();
  const initialised = useRef(false);
  const [lowStock, setLowStock] = useState(true);
  const [stockout, setStockout] = useState(true);
  const [overstock, setOverstock] = useState(false);
  const [dailyForecast, setDailyForecast] = useState(true);
  const [restockRecommendations, setRestockRecommendations] = useState(true);
  const [deadStockAlert, setDeadStockAlert] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [bulkImport, setBulkImport] = useState(true);
  const [apiQuota, setApiQuota] = useState(false);
  const [emailCh, setEmailCh] = useState(true);
  const [pushCh, setPushCh] = useState(true);
  const [slackCh, setSlackCh] = useState(false);
  const [smsCh, setSmsCh] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.notifications && !initialised.current) {
      const n = settings.notifications;
      setLowStock(n.lowStock !== false);
      setStockout(n.stockout !== false);
      setOverstock(n.overstock || false);
      setDailyForecast(n.dailyForecast !== false);
      setRestockRecommendations(n.restockRecommendations !== false);
      setDeadStockAlert(n.deadStockAlert || false);
      setLoginAlerts(n.loginAlerts !== false);
      setBulkImport(n.bulkImport !== false);
      setApiQuota(n.apiQuota || false);
      if (n.channels) {
        setEmailCh(n.channels.email !== false);
        setPushCh(n.channels.push !== false);
        setSlackCh(n.channels.slack || false);
        setSmsCh(n.channels.sms || false);
      }
      initialised.current = true;
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    const ok = await saveSettings('notifications', {
      lowStock, stockout, overstock, dailyForecast,
      restockRecommendations, deadStockAlert, loginAlerts,
      bulkImport, apiQuota,
      channels: { email: emailCh, push: pushCh, slack: slackCh, sms: smsCh },
    });
    setSaving(false);
    if (ok) {
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      toast.success('Notification preferences saved.');
    } else {
      toast.error('Failed to save notification preferences.');
    }
  };

  const channelItems = [
    { label: 'Email Digest', Icon: Mail, on: emailCh, setOn: setEmailCh },
    { label: 'Push (Browser)', Icon: Bell, on: pushCh, setOn: setPushCh },
    { label: 'Slack Channel', Icon: MessageSquare, on: slackCh, setOn: setSlackCh, comingSoon: true },
    { label: 'SMS Alerts', Icon: Smartphone, on: smsCh, setOn: setSmsCh, comingSoon: true },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader icon={<BellRing size={20} className="text-primary" />} title="Notification Preferences" />
        <div className="mb-6">
          <p className="text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-widest mb-3">Inventory Alerts</p>
          <div className="space-y-3">
            <Toggle checked={lowStock} onChange={setLowStock} label="Low Stock Alerts" sub="Notify when product stock falls below threshold" />
            <Toggle checked={stockout} onChange={setStockout} label="Stockout Warnings" sub="Alert when an item reaches zero units" />
            <Toggle checked={overstock} onChange={setOverstock} label="Overstock Alerts" sub="Flag when stock exceeds 150% of target level" />
          </div>
        </div>
        <div className="mb-6">
          <p className="text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-widest mb-3">AI Insights</p>
          <div className="space-y-3">
            <Toggle checked={dailyForecast} onChange={setDailyForecast} label="Daily Demand Forecasts" sub="Receive AI-generated demand reports every morning" />
            <Toggle checked={restockRecommendations} onChange={setRestockRecommendations} label="Restock Recommendations" sub="Get smart suggestions when to reorder from suppliers" />
            <Toggle checked={deadStockAlert} onChange={setDeadStockAlert} label="Dead Stock Detected" sub="Alert when items haven't moved in 60+ days" />
          </div>
        </div>
        <div className="mb-6">
          <p className="text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-widest mb-3">System & Security</p>
          <div className="space-y-3">
            <Toggle checked={loginAlerts} onChange={setLoginAlerts} label="Login from New Device" sub="Notify when account accessed from an unrecognized device" />
            <Toggle checked={bulkImport} onChange={setBulkImport} label="Bulk Import Completed" sub="Confirm when a CSV or OCR batch import finishes" />
            <Toggle checked={apiQuota} onChange={setApiQuota} label="API Quota Warnings" sub="Alert when approaching monthly API usage limits" />
          </div>
        </div>
        <div className="flex justify-end items-center gap-4">
          {saved && <span className="text-[#2E7D32] font-semibold text-sm flex items-center gap-1"><CheckCircle size={16} /> Saved!</span>}
          <Button variant="primary" size="lg" loading={saving} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Notifications'}
          </Button>
        </div>
      </Card>
      <Card>
        <SectionHeader icon={<Send size={20} className="text-primary" />} title="Notification Channels" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {channelItems.map(ch => (
            <button
              key={ch.label}
              type="button"
              onClick={() => !ch.comingSoon && ch.setOn(!ch.on)}
              disabled={ch.comingSoon}
              className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all relative ${
                ch.comingSoon
                  ? 'border-paper-rule dark:border-ink-rule text-ink/20 dark:text-paper/20 cursor-not-allowed'
                  : ch.on
                    ? 'border-primary bg-primary/5 dark:bg-primary/10 text-primary'
                    : 'border-paper-rule dark:border-ink-rule text-ink/40 dark:text-paper/40 hover:border-primary/30'
              }`}
            >
              {ch.comingSoon && <span className="absolute top-1.5 right-1.5 text-[8px] font-bold bg-brass/10 text-brass-deep dark:text-brass px-1.5 py-0.5 rounded">SOON</span>}
              <ch.Icon size={24} />
              <span className="text-xs font-bold text-ink dark:text-paper">{ch.label}</span>
              <span className={`text-[10px] font-bold ${ch.comingSoon ? 'text-ink/20 dark:text-paper/20' : ch.on ? 'text-primary' : 'text-ink/40'}`}>
                {ch.comingSoon ? 'COMING SOON' : ch.on ? 'ENABLED' : 'DISABLED'}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── BILLING (honest free-plan placeholder) ───────────────────────────────────
function BillingSection() {
  return (
    <div className="space-y-6">
      <div className="bg-primary rounded-2xl p-6 text-paper shadow-card border border-primary-deep"
        style={{ background: 'linear-gradient(135deg, #213467 0%, #0D2240 100%)' }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-white/70">Current Plan</span>
            <h3 className="text-2xl font-black mt-1">Free</h3>
            <p className="text-white/80 text-sm mt-1">All core features included while in beta.</p>
          </div>
          <div>
            <span className="bg-white/20 text-white text-[10px] font-bold px-3 py-1 rounded-full border border-white/20">BETA</span>
          </div>
        </div>
      </div>
      <Card>
        <SectionHeader icon={<Info size={20} className="text-primary" />} title="Billing & Plan" />
        <div className="text-center py-10">
          <CreditCard size={36} className="text-ink/20 dark:text-paper/20 mx-auto mb-3" />
          <p className="text-base font-semibold text-ink dark:text-paper">Paid plans aren't available yet.</p>
          <p className="text-xs text-ink/50 dark:text-paper/50 mt-2 max-w-md mx-auto">
            SmartStock AI is in beta and free to use. When subscriptions launch you'll see plan
            details, invoices, and payment methods here.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─── USER MANAGEMENT (real /users data, admin-only) ──────────────────────────
function UsersSection({ currentUserId }) {
  const { toast } = useToast();
  const [users, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await getUsers();
      setUsersList(data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const onRoleChange = async (id, role) => {
    setBusyId(id);
    try {
      await updateUserRole(id, role);
      toast.success('Role updated.');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update role.');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await deleteUser(id);
      toast.success('User deleted.');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user.');
    } finally {
      setBusyId(null);
    }
  };

  const roleColors = {
    admin: 'bg-primary/10 text-primary',
    manager: 'bg-paper-rule/60 dark:bg-ink-rule/40 text-ink/70 dark:text-paper/70',
    staff: 'bg-paper-rule/40 dark:bg-ink-rule/30 text-ink/50 dark:text-paper/50',
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-display font-bold text-ink dark:text-paper flex items-center gap-2">
            <Users size={20} className="text-primary" />
            Team Members
            <span className="text-[11px] bg-paper-rule/60 dark:bg-ink-rule/40 text-ink/50 dark:text-paper/50 px-2 py-0.5 rounded-full font-bold">{users.length} {users.length === 1 ? 'Member' : 'Members'}</span>
          </h2>
          <button
            type="button"
            disabled
            title="Invite flow coming soon"
            className="flex items-center gap-2 bg-paper-rule/60 dark:bg-ink-rule/40 text-ink/40 dark:text-paper/40 px-4 py-2 rounded-xl text-sm font-bold cursor-not-allowed"
          >
            <UserPlus size={18} /> Invite (soon)
          </button>
        </div>
        {error ? (
          <div className="bg-primary/8 dark:bg-primary/15 border border-primary/25 text-primary rounded-xl p-4 text-sm">{error}</div>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-ink/40 dark:text-paper/40 text-sm">No users yet.</div>
        ) : (
          <div className="border border-paper-rule dark:border-ink-rule rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-paper dark:bg-ink border-b border-paper-rule dark:border-ink-rule">
                <tr>
                  {['Member', 'Role', 'Joined', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-bold text-ink/40 dark:text-paper/40 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-rule dark:divide-ink-rule">
                {users.map(u => {
                  const isMe = u._id === currentUserId;
                  const initials = (u.name || u.email || '?').split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
                  return (
                    <tr key={u._id} className="hover:bg-paper/60 dark:hover:bg-ink/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shadow-sm">{initials}</div>
                          <div>
                            <p className="text-sm font-bold text-ink dark:text-paper">
                              {u.name}
                              {isMe && <span className="ml-2 text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">YOU</span>}
                            </p>
                            <p className="text-xs text-ink/40 dark:text-paper/40">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {isMe ? (
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${roleColors[u.role] || roleColors.staff}`}>{(u.role || 'staff').toUpperCase()}</span>
                        ) : (
                          <select
                            value={u.role || 'staff'}
                            disabled={busyId === u._id}
                            onChange={(e) => onRoleChange(u._id, e.target.value)}
                            className="text-xs font-bold border border-paper-rule dark:border-ink-rule rounded-lg px-2 py-1.5 bg-paper-card dark:bg-ink-card text-ink dark:text-paper focus:outline-none focus:border-primary"
                          >
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="staff">Staff</option>
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-ink/40 dark:text-paper/40">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        {isMe ? (
                          <span className="text-[11px] text-ink/30 dark:text-paper/30">—</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === u._id}
                            onClick={() => onDelete(u._id, u.name)}
                            className="p-1.5 text-ink/30 dark:text-paper/30 hover:text-primary hover:bg-primary/8 dark:hover:bg-primary/15 rounded-lg transition-colors disabled:opacity-50"
                            aria-label={`Delete ${u.name}`}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <SectionHeader icon={<Shield size={20} className="text-primary" />} title="Role Permissions" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { role: 'Admin', color: 'primary', perms: ['Full system access', 'Manage users & roles', 'Billing & API control', 'Delete data'] },
            { role: 'Manager', color: 'secondary', perms: ['View & edit inventory', 'Create transactions & sales', 'Access AI insights', 'Export reports'] },
            { role: 'Staff', color: 'muted', perms: ['View dashboard', 'Read-only inventory', 'No data mutations', 'No billing access'] },
          ].map(({ role, color, perms }) => (
            <div
              key={role}
              className={`p-4 rounded-xl border ${
                color === 'primary'
                  ? 'border-primary/20 bg-primary/5 dark:bg-primary/10'
                  : 'border-paper-rule dark:border-ink-rule bg-paper dark:bg-ink'
              }`}
            >
              <p className={`text-xs font-black uppercase tracking-wider mb-3 ${
                color === 'primary' ? 'text-primary' : 'text-ink/50 dark:text-paper/50'
              }`}>{role}</p>
              <ul className="space-y-2">
                {perms.map(p => (
                  <li key={p} className="flex items-center gap-2 text-xs text-ink/70 dark:text-paper/70">
                    <Check size={14} className={color === 'primary' ? 'text-primary' : 'text-brass'} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── ROOT PAGE ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, setUser } = useContext(AuthContext);
  const [active, setActive] = useState('profile');
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    getSettings()
      .then(res => setSettings(res.data.data))
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  // Generic save. The `__multi__` mode lets a section save into multiple
  // top-level sections atomically (e.g. workspace + preferences in one call).
  const saveSettings = async (section, data, opts = {}) => {
    try {
      const payload = section === '__multi__' ? data : { [section]: data };
      const res = await updateSettings(payload);
      setSettings(res.data.data);
      return true;
    } catch (err) {
      if (!opts.silent) console.error('saveSettings failed:', err);
      return false;
    }
  };

  // Filter Settings sub-nav by role so staff don't see admin-only sections.
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.roles || (user?.role && item.roles.includes(user.role))
  );
  const safeActive = visibleNavItems.some((it) => it.id === active) ? active : 'profile';

  const SECTIONS = {
    profile: <ProfileSection user={user} setUser={setUser} settings={settings} saveSettings={saveSettings} />,
    workspace: <WorkspaceSection settings={settings} saveSettings={saveSettings} />,
    'ai-config': <AiConfigSection settings={settings} saveSettings={saveSettings} />,
    integrations: <IntegrationsSection />,
    notifications: <NotificationsSection settings={settings} saveSettings={saveSettings} />,
    billing: <BillingSection />,
    users: user?.role === 'admin' ? <UsersSection currentUserId={user?._id || user?.id} /> : null,
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 md:px-10 py-8 flex flex-col lg:flex-row gap-8 min-h-full">
      {/* Left Sidebar */}
      <aside className="w-full lg:w-60 flex-shrink-0 flex flex-col gap-2">
        <div className="p-4 mb-2 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/10 dark:border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest font-bold text-primary">Current Plan</span>
            <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full font-bold">BETA</span>
          </div>
          <p className="text-sm font-bold text-ink dark:text-paper">Free during beta</p>
          <p className="text-xs text-ink/50 dark:text-paper/50 mt-0.5">All features included.</p>
        </div>
        <nav className="flex flex-col gap-1">
          {visibleNavItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-left w-full ${
                safeActive === item.id
                  ? 'bg-primary/10 dark:bg-primary/20 text-primary font-semibold'
                  : 'text-ink/60 dark:text-paper/60 hover:bg-paper dark:hover:bg-ink'
              }`}
            >
              <item.icon size={20} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 space-y-2 pb-20">
        <PageHeader
          icon={Settings}
          title="Account Settings"
          description="Manage your profile, workspace, AI behaviour, and team."
        />
        {settingsLoading ? (
          <div className="space-y-4">
            <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-6 space-y-4">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="h-20" />
            </div>
          </div>
        ) : SECTIONS[safeActive]}
      </div>
    </div>
  );
}
