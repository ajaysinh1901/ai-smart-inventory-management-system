const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  profile: {
    jobTitle: { type: String, default: '' },
  },
  workspace: {
    companyName: { type: String, default: '' },
    industry: { type: String, default: '' },
    website: { type: String, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    description: { type: String, default: '' },
    // Seller fields print on every tax invoice. Keeping them on Settings
    // (not hardcoded in InvoiceModal) means each user's invoices show their
    // own legal name, GSTIN, and place of supply.
    gstin: { type: String, default: '' },
    address: { type: String, default: '' },
    state: { type: String, default: '' },
    pinCode: { type: String, default: '' },
    // UPI is the dominant Indian retail payment rail. When `upiId` is set,
    // every invoice renders a "Scan to Pay" QR using the upi:// deep link.
    // Validated as `<vpa>@<provider>` shape on the controller.
    upiId: { type: String, default: '' },
    payeeName: { type: String, default: '' },
    // --- spec: setup-flow-and-units.md §A + §B.8 ---
    // Store segmentation: controls UI density, defaults, and feature exposure.
    storeProfile: { type: String, enum: ['small', 'big'], default: 'small' },
    // Store vertical: drives sample-pack selection in onboarding step 4.
    storeType: { type: String, enum: ['kirana', 'pharmacy', 'general', 'wholesale', 'restaurant', 'other'], default: 'kirana' },
    // UI language chosen in onboarding step 1.
    defaultLang: { type: String, enum: ['en', 'hi', 'gu'], default: 'en' },
    // Indian state name (e.g. "Gujarat"). Required for CGST+SGST vs IGST determination.
    // `state` already exists above from legacy — these are the *new* fields added to the workspace block.
    // GST business details captured in onboarding step 2.
    gstRegistered: { type: Boolean, default: false },
    legalName: { type: String, default: '' },
    // fyStart: fiscal year start as MM-DD, April 1 default per Indian tax calendar.
    fyStart: { type: String, default: '04-01' },
    bankLast4: { type: String, default: '' },
    eInvoiceEnabled: { type: Boolean, default: false },
    // Weight display mode per spec §B.8 — "mixed" = "1 kg 250 g", "decimal" = "1.250 kg".
    // Default flipped by storeProfile save hook (small → mixed, big → decimal).
    weightDisplay: { type: String, enum: ['mixed', 'decimal'], default: 'mixed' },
    // Paise display: small profile hides paise (round on display), big shows them.
    paiseDisplay: { type: Boolean, default: false },
  },
  preferences: {
    darkMode: { type: Boolean, default: false },
    compactView: { type: Boolean, default: true },
    showStockAlerts: { type: Boolean, default: true },
  },
  aiConfig: {
    // Accepts current Gemini families. Legacy IDs kept so older users don't break.
    model: { type: String, enum: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-flash', 'gemini-pro', 'legacy'], default: 'gemini-2.5-flash' },
    sensitivity: { type: Number, min: 20, max: 100, default: 85 },
    autoOptimize: { type: Boolean, default: true },
    predictiveAlerts: { type: Boolean, default: true },
    deadStockDetection: { type: Boolean, default: false },
    supplierPriceMonitoring: { type: Boolean, default: true },
  },
  notifications: {
    lowStock: { type: Boolean, default: true },
    stockout: { type: Boolean, default: true },
    overstock: { type: Boolean, default: false },
    dailyForecast: { type: Boolean, default: true },
    restockRecommendations: { type: Boolean, default: true },
    deadStockAlert: { type: Boolean, default: false },
    loginAlerts: { type: Boolean, default: true },
    bulkImport: { type: Boolean, default: true },
    apiQuota: { type: Boolean, default: false },
    channels: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      slack: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
  },
  // --- spec: setup-flow-and-units.md §C.5 ---
  // Server-side onboarding resume state. Lives on Settings (userId-keyed) so
  // a user who signs up on phone Monday and continues on PC Tuesday sees the
  // same step. completedSteps is deduped by the workspace controller.
  onboarding: {
    currentStep:    { type: Number, default: 0, min: 0, max: 7 },
    completedSteps: { type: [Number], default: [] },
    dismissed:      { type: Boolean, default: false },
    // Which sample pack was picked in step 4 (null = not yet chosen).
    sampleSeedUsed: { type: String, enum: ['kirana', 'pharmacy', 'general', null], default: null },
    // Set when step 7 (first invoice) is completed — the activation event.
    completedAt:    { type: Date, default: null },
  },
}, { timestamps: true });

// --- pre-save hook: storeProfile → weightDisplay / paiseDisplay defaults ---
// Flip display defaults when storeProfile changes — but only if the user
// has NOT already overridden those fields from their schema defaults.
// "At default" is proxied by checking isModified on the field itself:
// if the doc is new OR the user explicitly changed weightDisplay/paiseDisplay
// this session, we respect their choice; otherwise we apply the profile default.
// C1 fix: converted from sync function(next) to async — Mongoose 9/Kareem 3 no longer passes next | spec: setup-flow-and-units.md §B.8
settingsSchema.pre('save', async function () {
  // Only run when storeProfile was modified (or on new doc).
  if (!this.isModified('workspace.storeProfile') && !this.isNew) return;

  const profile = this.workspace && this.workspace.storeProfile;
  if (!profile) return;

  // Determine if the user explicitly set these fields in this save operation.
  const weightExplicit = this.isModified('workspace.weightDisplay');
  const paiseExplicit  = this.isModified('workspace.paiseDisplay');

  if (profile === 'big') {
    if (!weightExplicit) this.workspace.weightDisplay = 'decimal';
    if (!paiseExplicit)  this.workspace.paiseDisplay  = true;
  } else {
    // small (default)
    if (!weightExplicit) this.workspace.weightDisplay = 'mixed';
    if (!paiseExplicit)  this.workspace.paiseDisplay  = false;
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
