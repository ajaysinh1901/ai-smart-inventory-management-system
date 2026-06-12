/**
 * E2E test helpers — login, token management, axios config
 */

const axios = require('axios');

const API = process.env.API_URL || 'http://localhost:5000/api/v1';

function log(status, name, detail = '') {
  const icon = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'SKIP';
  const prefix = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${prefix} ${prefix === '✅' ? '  ' : ''}${status}  ${name}${detail ? ' — ' + detail : ''}`);
}

function assert(cond, name, detail) {
  log(cond ? 'PASS' : 'FAIL', name, detail);
  if (!cond) process.exitCode = 1;
}

function skip(name, detail) {
  log('SKIP', name, detail);
}

/**
 * Login or register if needed, return axios config with Bearer token
 */
async function setupAuth(email = null, password = 'Test@123456') {
  email = email || `e2e-${Date.now()}@smartstock.test`;
  try {
    // Always try register first (will fail if user exists, but register handles that)
    try {
      const regRes = await axios.post(`${API}/auth/register`, { email, password, name: 'E2E Tester' });
      if (regRes.status === 200 || regRes.status === 201) {
        const token = regRes.data?.token || regRes.data?.data?.token;
        if (token) {
          return {
            token,
            config: { headers: { Authorization: `Bearer ${token}` } },
            email,
            userId: regRes.data?.user?.id || regRes.data?.data?.user?._id,
          };
        }
      }
    } catch (regErr) {
      // If register fails (user already exists or other error), try login
      if (regErr.response?.status === 400 || regErr.response?.data?.message?.includes('exist')) {
        const loginRes = await axios.post(`${API}/auth/login`, { email, password });
        if (loginRes.status === 200) {
          const token = loginRes.data?.token || loginRes.data?.data?.token;
          if (token) {
            return {
              token,
              config: { headers: { Authorization: `Bearer ${token}` } },
              email,
              userId: loginRes.data?.user?.id || loginRes.data?.data?.user?._id,
            };
          }
        }
      }
      // Rethrow registration error if it's not "user exists"
      throw regErr;
    }
  } catch (e) {
    throw new Error(`Auth failed: ${e.response?.data?.message || e.message}`);
  }
  throw new Error('Login/register failed');
}

module.exports = { log, assert, skip, API, setupAuth, axios };
