'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const API = process.env.API_URL || 'http://localhost:5000/api/v1';
let testUserId, authToken, axiosConfig;
const startTime = Date.now();

function log(s, m) { console.log(`[${((Date.now()-startTime)/1000).toFixed(1)}s] ${s}: ${m}`); }

test('E2E: 5-min onboarding speedrun', async () => {
  try {
    log('0', 'POST /auth/register');
    const email = `test-e2e-${Date.now()}@smartstock.test`;
    const regRes = await axios.post(`${API}/auth/register`, { email, password: 'Test@123456', name: 'Test' });
    testUserId = regRes.data?.data?.user?._id;
    log('1', 'POST /auth/login');
    const loginRes = await axios.post(`${API}/auth/login`, { email, password: 'Test@123456' });
    authToken = loginRes.data?.data?.token;
    axiosConfig = { headers: { Authorization: `Bearer ${authToken}` } };
    log('2', 'PATCH /workspace/onboarding step 1');
    const s1 = await axios.patch(`${API}/workspace/onboarding`, { currentStep: 1, stepData: { companyName: 'Test Kirana', storeProfile: 'small', state: 'Gujarat' } }, axiosConfig);
    assert.equal(s1.status, 200);
    log('3', 'seed kirana pack');
    const seed = await axios.post(`${API}/sample-packs/seed`, { packId: 'kirana' }, axiosConfig);
    assert.ok(seed.data?.data?.insertedCount >= 30);
    log('4', 'complete onboarding');
    const s7 = await axios.patch(`${API}/workspace/onboarding`, { currentStep: 7, complete: true }, axiosConfig);
    assert.equal(s7.status, 200);
    log('final', 'SUCCESS');
  } catch (e) {
    log('FAIL', e.message);
    throw e;
  }
});
