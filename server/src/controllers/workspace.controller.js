// Workspace + onboarding controller.
// All handlers are scoped to req.user.id — no cross-user access possible.
// spec: setup-flow-and-units.md §A, §C.2, §C.5
'use strict';

const Settings = require('../models/Settings.model');
const { validateStepData } = require('../validators/workspace.validator');

// ---------------------------------------------------------------------------
// Helper — find or create Settings for the authenticated user
// ---------------------------------------------------------------------------
async function getOrCreateSettings(userId) {
  let settings = await Settings.findOne({ userId });
  if (!settings) {
    settings = await Settings.create({ userId });
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Helper — extract the workspace + onboarding payload for API responses
// ---------------------------------------------------------------------------
function workspacePayload(settings) {
  return {
    workspace:  settings.workspace,
    onboarding: settings.onboarding,
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/workspace
// Returns the full workspace block (workspace + onboarding).
// spec: setup-flow-and-units.md §C.5
// ---------------------------------------------------------------------------
exports.getWorkspace = async (req, res) => {
  // Returns workspace + onboarding for the authenticated user | spec: setup-flow-and-units §C.5
  try {
    const settings = await getOrCreateSettings(req.user.id);
    res.json({ success: true, data: workspacePayload(settings) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/workspace
// Partial update of workspace fields. Unknown fields rejected by Zod (strict).
// spec: setup-flow-and-units.md §A, §B.8
// ---------------------------------------------------------------------------
exports.patchWorkspace = async (req, res) => {
  // Applies partial workspace field update; Zod strict mode blocks unknown keys | spec: setup-flow-and-units §A
  try {
    const updates = req.body; // already validated by Zod middleware (patchWorkspaceSchema)

    const settings = await getOrCreateSettings(req.user.id);

    // Apply each provided field individually so the pre-save hook can detect
    // which fields were explicitly changed vs. implicitly unchanged.
    for (const [key, value] of Object.entries(updates)) {
      settings.workspace[key] = value;
      settings.markModified(`workspace.${key}`);
    }

    await settings.save();

    res.json({ success: true, data: workspacePayload(settings) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/workspace/onboarding
// Returns onboarding resume state. Called on every app load by the topbar pill.
// spec: setup-flow-and-units.md §C.5
// ---------------------------------------------------------------------------
exports.getOnboarding = async (req, res) => {
  // Returns onboarding resume state for the topbar resume pill | spec: setup-flow-and-units §C.5
  try {
    const settings = await getOrCreateSettings(req.user.id);
    res.json({ success: true, data: settings.onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/workspace/onboarding
// Advances onboarding state. Accepts either `stepNumber` (spec) or
// `currentStep` (frontend convention — both mean the same thing).
// Optional `stepData` is validated against a per-step whitelist before
// being merged into Settings.workspace.
// spec: setup-flow-and-units.md §C.2, §C.5
// ---------------------------------------------------------------------------
exports.patchOnboarding = async (req, res) => {
  // Advances onboarding step, validates + persists optional stepData | spec: setup-flow-and-units §C.5
  try {
    const {
      stepNumber,
      currentStep,
      completedSteps: completedStepsOverride,
      complete,
      dismissed,
      stepData,
    } = req.body; // pre-validated by patchOnboardingSchema Zod middleware

    const settings = await getOrCreateSettings(req.user.id);
    const ob = settings.onboarding;

    // Handle `dismissed` sent via PATCH (frontend's dismissOnboarding() path)
    if (dismissed === true) {
      ob.dismissed = true;
      await settings.save();
      return res.json({ success: true, data: settings.onboarding });
    }

    // Resolve step number — frontend sends `currentStep`, spec uses `stepNumber`
    const step = stepNumber ?? currentStep ?? null;

    // If caller provides a full completedSteps array (completeOnboarding path), merge it
    if (Array.isArray(completedStepsOverride)) {
      const merged = new Set([...ob.completedSteps, ...completedStepsOverride]);
      ob.completedSteps = [...merged];
    }

    if (step !== null && step > 0) {
      // Advance currentStep to max of stored vs incoming
      ob.currentStep = Math.max(ob.currentStep, step);

      // Dedup-push this step into completedSteps
      const stepSet = new Set(ob.completedSteps);
      stepSet.add(step);
      ob.completedSteps = [...stepSet].sort((a, b) => a - b);

      // Validate and apply stepData to workspace if provided
      if (stepData && typeof stepData === 'object' && Object.keys(stepData).length > 0) {
        const validation = validateStepData(step, stepData);
        if (!validation.ok) {
          return res.status(400).json({
            success: false,
            message: validation.message || 'Invalid stepData',
            errors: validation.errors || [],
          });
        }

        // Apply validated stepData fields to workspace
        // sampleSeedUsed lives on onboarding, all other fields go to workspace
        const { sampleSeedUsed, ...workspaceFields } = validation.data;

        if (sampleSeedUsed !== undefined) {
          ob.sampleSeedUsed = sampleSeedUsed;
        }

        for (const [key, value] of Object.entries(workspaceFields)) {
          if (value !== undefined) {
            settings.workspace[key] = value;
            settings.markModified(`workspace.${key}`);
          }
        }
      }
    }

    // Mark as complete (activation event — step 7 done)
    if (complete === true && !ob.completedAt) {
      ob.completedAt = new Date();
    }

    settings.markModified('onboarding');
    await settings.save();

    res.json({ success: true, data: settings.onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// POST /api/v1/workspace/onboarding/dismiss
// Sets dismissed = true. Wizard moves to Settings → Setup, never deleted.
// spec: setup-flow-and-units.md §C.5
// ---------------------------------------------------------------------------
exports.dismissOnboarding = async (req, res) => {
  // Sets onboarding dismissed flag — wizard moves to Settings, not deleted | spec: setup-flow-and-units §C.5
  try {
    const settings = await getOrCreateSettings(req.user.id);
    settings.onboarding.dismissed = true;
    settings.markModified('onboarding');
    await settings.save();
    res.json({ success: true, data: settings.onboarding });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
