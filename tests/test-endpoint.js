const axios = require('axios');

(async () => {
  try {
    // Register user
    const reg = await axios.post('http://localhost:5000/api/v1/auth/register', {
      email: `test-${Date.now()}@test.com`,
      password: 'Test@123456',
      name: 'Test'
    });
    const token = reg.data.token;
    console.log('Auth token:', token.substring(0, 30) + '...');

    // Try GET workspace
    try {
      const ws = await axios.get('http://localhost:5000/api/v1/workspace', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('GET /workspace SUCCESS');
      console.log(JSON.stringify(ws.data, null, 2));
    } catch (e) {
      console.log('GET /workspace FAILED:', e.response?.status, e.response?.data);
    }

    // Try GET workspace/onboarding
    try {
      const onb = await axios.get('http://localhost:5000/api/v1/workspace/onboarding', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('GET /workspace/onboarding SUCCESS');
      console.log(JSON.stringify(onb.data, null, 2));
    } catch (e) {
      console.log('GET /workspace/onboarding FAILED:', e.response?.status, e.response?.data);
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
