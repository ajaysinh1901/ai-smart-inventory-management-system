// Settings request schemas. | spec: B2
const { z } = require('zod');

// A1-04 fix: workspace now includes all invoice fields (GSTIN, state, UPI, pinCode, etc.)
// so they are accepted and persisted instead of being silently stripped | spec: B2
const workspace = z
  .object({
    companyName:        z.string().trim().optional(),
    industry:           z.string().trim().optional(),
    website:            z.string().trim().optional(),
    timezone:           z.string().trim().optional(),
    description:        z.string().trim().optional(),
    // Invoice / legal fields
    gstin:              z.string().trim().max(15).optional(),
    address:            z.string().trim().max(300).optional(),
    state:              z.string().trim().max(60).optional(),
    pinCode:            z.string().trim().max(10).optional(),
    upiId:              z.string().trim().max(100).optional(),
    payeeName:          z.string().trim().max(120).optional(),
    legalName:          z.string().trim().max(120).optional(),
    // Store configuration fields
    storeProfile:       z.enum(['small', 'big']).optional(),
    storeType:          z.enum(['kirana', 'pharmacy', 'general', 'wholesale', 'restaurant', 'other']).optional(),
    defaultLang:        z.enum(['en', 'hi', 'gu']).optional(),
    gstRegistered:      z.boolean().optional(),
    fyStart:            z.string().trim().optional(),
    bankLast4:          z.string().trim().max(4).optional(),
    eInvoiceEnabled:    z.boolean().optional(),
    weightDisplay:      z.enum(['mixed', 'decimal']).optional(),
    paiseDisplay:       z.boolean().optional(),
  })
  .partial();

// A1-02 fix: added profile section so job title can be saved | spec: B2
const profile = z
  .object({
    jobTitle: z.string().trim().max(120).optional(),
  })
  .partial();

const preferences = z
  .object({
    darkMode: z.boolean().optional(),
    compactView: z.boolean().optional(),
    showStockAlerts: z.boolean().optional(),
  })
  .partial();

const aiConfig = z
  .object({
    // A1-03 fix: expanded enum to include all real Gemini model IDs the UI sends | spec: B2
    model: z.enum([
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-flash',
      'gemini-pro',
      'legacy',
    ]).optional(),
    sensitivity: z.number().min(20).max(100).optional(),
    autoOptimize: z.boolean().optional(),
    predictiveAlerts: z.boolean().optional(),
    deadStockDetection: z.boolean().optional(),
    supplierPriceMonitoring: z.boolean().optional(),
  })
  .partial();

const channels = z
  .object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    slack: z.boolean().optional(),
    sms: z.boolean().optional(),
  })
  .partial();

const notifications = z
  .object({
    lowStock: z.boolean().optional(),
    stockout: z.boolean().optional(),
    overstock: z.boolean().optional(),
    dailyForecast: z.boolean().optional(),
    restockRecommendations: z.boolean().optional(),
    deadStockAlert: z.boolean().optional(),
    loginAlerts: z.boolean().optional(),
    bulkImport: z.boolean().optional(),
    apiQuota: z.boolean().optional(),
    channels: channels.optional(),
  })
  .partial();

exports.updateSettingsSchema = z
  .object({
    profile:       profile.optional(),
    workspace:     workspace.optional(),
    preferences:   preferences.optional(),
    aiConfig:      aiConfig.optional(),
    notifications: notifications.optional(),
  })
  .refine(
    (obj) =>
      obj.profile !== undefined ||
      obj.workspace !== undefined ||
      obj.preferences !== undefined ||
      obj.aiConfig !== undefined ||
      obj.notifications !== undefined,
    { message: 'At least one settings section is required' }
  );

exports.updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});
