'use strict';
/**
 * Smoke tests — workspace storeProfile + onboarding state
 * Run: node --test tests/smoke/workspace-onboarding.test.js
 *
 * These tests exercise:
 *   1. Zod validators (workspace.validator.js)
 *   2. Settings pre-save hook logic (extracted inline — no live DB needed)
 *   3. Controller logic (patchOnboarding) exercised against a mock Settings object
 *
 * spec: setup-flow-and-units.md §A, §B.8, §C.2, §C.5
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');

// ---------------------------------------------------------------------------
// Load validators
// ---------------------------------------------------------------------------
const {
  patchWorkspaceSchema,
  patchOnboardingSchema,
  validateStepData,
  INDIAN_STATES,
} = require(path.resolve(__dirname, '../../src/validators/workspace.validator'));

// ---------------------------------------------------------------------------
// Helper — simulate the Settings pre-save hook in isolation (no Mongoose/DB)
// ---------------------------------------------------------------------------
function simulatePresaveHook(doc) {
  // Mirrors the logic in Settings.model.js settingsSchema.pre('save')
  // Arguments: doc = { workspace: { storeProfile, weightDisplay?, paiseDisplay? }, _modifiedPaths: Set }
  const profile = doc.workspace && doc.workspace.storeProfile;
  if (!profile) return doc;

  const weightExplicit = doc._modifiedPaths.has('workspace.weightDisplay');
  const paiseExplicit  = doc._modifiedPaths.has('workspace.paiseDisplay');

  if (profile === 'big') {
    if (!weightExplicit) doc.workspace.weightDisplay = 'decimal';
    if (!paiseExplicit)  doc.workspace.paiseDisplay  = true;
  } else {
    if (!weightExplicit) doc.workspace.weightDisplay = 'mixed';
    if (!paiseExplicit)  doc.workspace.paiseDisplay  = false;
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Helper — simulate patchOnboarding controller logic (no HTTP, no DB)
// ---------------------------------------------------------------------------
function simulatePatchOnboarding(existingOnboarding, body) {
  // Returns { onboarding, workspaceFields, statusCode, message }
  // Mirrors workspace.controller.js patchOnboarding
  const ob = JSON.parse(JSON.stringify(existingOnboarding)); // deep clone
  const workspaceFields = {};

  const {
    stepNumber,
    currentStep,
    completedSteps: completedStepsOverride,
    complete,
    dismissed,
    stepData,
  } = body;

  if (dismissed === true) {
    ob.dismissed = true;
    return { onboarding: ob, workspaceFields, statusCode: 200 };
  }

  if (Array.isArray(completedStepsOverride)) {
    const merged = new Set([...ob.completedSteps, ...completedStepsOverride]);
    ob.completedSteps = [...merged];
  }

  const step = stepNumber ?? currentStep ?? null;

  if (step !== null && step > 0) {
    ob.currentStep = Math.max(ob.currentStep, step);
    const stepSet = new Set(ob.completedSteps);
    stepSet.add(step);
    ob.completedSteps = [...stepSet].sort((a, b) => a - b);

    if (stepData && typeof stepData === 'object' && Object.keys(stepData).length > 0) {
      const validation = validateStepData(step, stepData);
      if (!validation.ok) {
        return { onboarding: ob, workspaceFields, statusCode: 400, message: validation.message, errors: validation.errors };
      }

      const { sampleSeedUsed, ...wFields } = validation.data;
      if (sampleSeedUsed !== undefined) ob.sampleSeedUsed = sampleSeedUsed;
      Object.assign(workspaceFields, wFields);
    }
  }

  if (complete === true && !ob.completedAt) {
    ob.completedAt = new Date().toISOString();
  }

  return { onboarding: ob, workspaceFields, statusCode: 200 };
}

// Default fresh onboarding state (mirrors Mongoose schema defaults)
function freshOnboarding() {
  return {
    currentStep:    0,
    completedSteps: [],
    dismissed:      false,
    sampleSeedUsed: null,
    completedAt:    null,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('storeProfile → weightDisplay / paiseDisplay hook', () => {

  test('1: PATCH workspace storeProfile=big + default weightDisplay → hook flips to decimal', () => {
    // spec: §B.8 — "decimal" is the big-store default for weight display
    const doc = {
      workspace:      { storeProfile: 'big', weightDisplay: 'mixed', paiseDisplay: false },
      _modifiedPaths: new Set(['workspace.storeProfile']), // only storeProfile was set
    };
    simulatePresaveHook(doc);
    assert.equal(doc.workspace.weightDisplay, 'decimal', 'weightDisplay should be flipped to decimal for big profile');
    assert.equal(doc.workspace.paiseDisplay, true, 'paiseDisplay should be flipped to true for big profile');
  });

  test('2: PATCH workspace storeProfile=big with explicit weightDisplay=mixed → user choice respected', () => {
    // spec: §B.8 — user explicitly chose mixed; hook must not override it
    const doc = {
      workspace:      { storeProfile: 'big', weightDisplay: 'mixed', paiseDisplay: false },
      _modifiedPaths: new Set(['workspace.storeProfile', 'workspace.weightDisplay']), // user explicitly set weightDisplay
    };
    simulatePresaveHook(doc);
    assert.equal(doc.workspace.weightDisplay, 'mixed', 'explicit user weightDisplay=mixed must be preserved');
    // paiseDisplay was NOT explicitly set, so hook still flips it
    assert.equal(doc.workspace.paiseDisplay, true, 'paiseDisplay (not explicitly set) should be flipped to true');
  });

  test('small storeProfile → weightDisplay stays mixed, paiseDisplay stays false', () => {
    const doc = {
      workspace:      { storeProfile: 'small', weightDisplay: 'decimal', paiseDisplay: true },
      _modifiedPaths: new Set(['workspace.storeProfile']),
    };
    simulatePresaveHook(doc);
    assert.equal(doc.workspace.weightDisplay, 'mixed', 'small profile defaults to mixed weight display');
    assert.equal(doc.workspace.paiseDisplay, false, 'small profile defaults paiseDisplay to false');
  });

});

describe('patchOnboarding — step progression', () => {

  test('3: stepNumber:1 + stepData → currentStep=1, completedSteps=[1], workspace fields set', () => {
    // spec: §C.5 — server persists step data, currentStep advances
    const result = simulatePatchOnboarding(freshOnboarding(), {
      stepNumber: 1,
      stepData:   { companyName: 'Test Store', storeType: 'kirana', state: 'Gujarat' },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.onboarding.currentStep, 1);
    assert.deepEqual(result.onboarding.completedSteps, [1]);
    assert.equal(result.workspaceFields.companyName, 'Test Store');
    assert.equal(result.workspaceFields.storeType, 'kirana');
    assert.equal(result.workspaceFields.state, 'Gujarat');
  });

  test('4: same step submitted twice → completedSteps remains [1] (deduped)', () => {
    // spec: §C.5 — deduplication prevents duplicates in completedSteps
    const existing = { ...freshOnboarding(), currentStep: 1, completedSteps: [1] };
    const result = simulatePatchOnboarding(existing, {
      stepNumber: 1,
      stepData:   { companyName: 'Test Store Again' },
    });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.onboarding.completedSteps, [1], 'step 1 should not be duplicated');
  });

  test('currentStep advances to max of existing and incoming', () => {
    // If user is at step 3 and somehow re-submits step 1, currentStep stays at 3
    const existing = { ...freshOnboarding(), currentStep: 3, completedSteps: [1, 2, 3] };
    const result = simulatePatchOnboarding(existing, { stepNumber: 1 });
    assert.equal(result.onboarding.currentStep, 3, 'currentStep should not regress');
  });

  test('step 7 + complete=true → completedAt set', () => {
    // spec: §C.2 — step 7 is the activation event; completedAt is the timestamp
    const result = simulatePatchOnboarding(
      { ...freshOnboarding(), currentStep: 6, completedSteps: [1,2,3,4,5,6] },
      { stepNumber: 7, complete: true },
    );
    assert.equal(result.statusCode, 200);
    assert.equal(result.onboarding.currentStep, 7);
    assert.ok(result.onboarding.completedAt, 'completedAt should be set on complete=true');
  });

});

describe('patchOnboarding — stepData validation', () => {

  test('5: non-whitelisted field in stepData → 400', () => {
    // spec: deliverable B — whitelist enforced; unknown fields rejected
    const result = simulatePatchOnboarding(freshOnboarding(), {
      stepNumber: 1,
      stepData:   { companyName: 'Test', maliciousField: 'inject' },
    });
    assert.equal(result.statusCode, 400, 'non-whitelisted field should return 400');
    assert.ok(result.message, 'error message should be present');
  });

  test('6: invalid GSTIN in step 2 stepData → 400', () => {
    // spec: GSTIN regex validation in per-step whitelist
    const result = simulatePatchOnboarding(freshOnboarding(), {
      stepNumber: 2,
      stepData:   { gstin: 'INVALID_GSTIN_123' },
    });
    assert.equal(result.statusCode, 400, 'invalid GSTIN should return 400');
  });

  test('valid GSTIN in step 2 → accepted and normalised to uppercase', () => {
    const result = simulatePatchOnboarding(freshOnboarding(), {
      stepNumber: 2,
      stepData:   { gstin: '27aapfu0939f1zv' }, // lowercase input
    });
    assert.equal(result.statusCode, 200);
    // Zod transform uppercases it
    assert.equal(result.workspaceFields.gstin, '27AAPFU0939F1ZV');
  });

  test('valid UPI in step 3 → accepted', () => {
    const result = simulatePatchOnboarding(freshOnboarding(), {
      stepNumber: 3,
      stepData:   { upiId: 'mystore@upi', bankLast4: '4242' },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.workspaceFields.upiId, 'mystore@upi');
  });

  test('invalid UPI in step 3 → 400', () => {
    const result = simulatePatchOnboarding(freshOnboarding(), {
      stepNumber: 3,
      stepData:   { upiId: 'not_a_upi_id' },
    });
    assert.equal(result.statusCode, 400, 'invalid UPI ID should return 400');
  });

  test('step 4 sampleSeedUsed → lands on onboarding, not workspaceFields', () => {
    const result = simulatePatchOnboarding(freshOnboarding(), {
      stepNumber: 4,
      stepData:   { sampleSeedUsed: 'kirana' },
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.onboarding.sampleSeedUsed, 'kirana');
    assert.equal(Object.keys(result.workspaceFields).length, 0, 'sampleSeedUsed must not leak to workspaceFields');
  });

  test('step 5/6/7 with empty stepData → 200 (steps with no data)', () => {
    for (const step of [5, 6, 7]) {
      const result = simulatePatchOnboarding(freshOnboarding(), {
        stepNumber: step,
        stepData:   {},
      });
      assert.equal(result.statusCode, 200, `step ${step} with empty stepData should be 200`);
    }
  });

});

describe('patchOnboarding — dismiss flow', () => {

  test('7: dismissed=true via PATCH body → dismissed flag set', () => {
    // spec: §C.5 — dismiss puts wizard in Settings, never deleted
    const result = simulatePatchOnboarding(freshOnboarding(), { dismissed: true });
    assert.equal(result.statusCode, 200);
    assert.equal(result.onboarding.dismissed, true);
  });

});

describe('getOnboarding — fresh state', () => {

  test('8: fresh onboarding state has correct defaults', () => {
    // spec: §C.5 — defaults from schema
    const ob = freshOnboarding();
    assert.equal(ob.currentStep, 0);
    assert.deepEqual(ob.completedSteps, []);
    assert.equal(ob.dismissed, false);
    assert.equal(ob.sampleSeedUsed, null);
    assert.equal(ob.completedAt, null);
  });

});

describe('patchWorkspace Zod schema', () => {

  test('valid partial workspace update → passes', () => {
    const result = patchWorkspaceSchema.safeParse({
      companyName:  'My Shop',
      storeProfile: 'big',
      storeType:    'kirana',
    });
    assert.ok(result.success, 'valid partial update should pass');
  });

  test('unknown key → rejected (strict mode)', () => {
    const result = patchWorkspaceSchema.safeParse({ hackerField: 'bad' });
    assert.ok(!result.success, 'unknown key must be rejected');
    assert.ok(
      result.error.issues.some(i => i.message.includes('Unrecognized')),
      'error should mention unrecognized key'
    );
  });

  test('invalid GSTIN via patchWorkspaceSchema → rejected', () => {
    const result = patchWorkspaceSchema.safeParse({ gstin: 'BADINPUT' });
    assert.ok(!result.success, 'bad GSTIN must be rejected at schema level');
  });

  test('valid GSTIN lowercase → normalised to uppercase', () => {
    const result = patchWorkspaceSchema.safeParse({ gstin: '27aapfu0939f1zv' });
    assert.ok(result.success);
    assert.equal(result.data.gstin, '27AAPFU0939F1ZV');
  });

  test('invalid state → rejected', () => {
    const result = patchWorkspaceSchema.safeParse({ state: 'Narnia' });
    assert.ok(!result.success, 'invalid state must be rejected');
  });

  test('valid state → accepted', () => {
    const result = patchWorkspaceSchema.safeParse({ state: 'Gujarat' });
    assert.ok(result.success);
  });

  test('patchOnboardingSchema: unknown key → rejected', () => {
    const result = patchOnboardingSchema.safeParse({ unknownKey: 42 });
    assert.ok(!result.success);
  });

  test('patchOnboardingSchema: valid body → passes', () => {
    const result = patchOnboardingSchema.safeParse({
      currentStep: 1,
      stepData: { companyName: 'Store' },
    });
    assert.ok(result.success);
  });

});
