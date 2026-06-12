const axios = require('axios');

(async () => {
  const API = 'http://localhost:5000/api/v1';
  const cfg = { headers: {} };
  
  try {
    // Auth
    const reg = await axios.post(`${API}/auth/register`, {
      email: `test-${Date.now()}@test.com`,
      password: 'Test@123456',
      name: 'Test'
    });
    const token = reg.data.token;
    cfg.headers.Authorization = `Bearer ${token}`;
    console.log('✓ Auth works');

    // Products
    const prod = await axios.get(`${API}/products`, cfg);
    console.log('✓ GET /products works, found', prod.data.meta?.total, 'products');

    // Sales
    const sales = await axios.get(`${API}/sales`, cfg);
    console.log('✓ GET /sales works');

    // Settings
    try {
      const settings = await axios.get(`${API}/settings`, cfg);
      console.log('✓ GET /settings works');
    } catch (e) {
      console.log('✗ GET /settings FAILED:', e.response?.status);
    }

    // Workspace
    try {
      const ws = await axios.get(`${API}/workspace`, cfg);
      console.log('✓ GET /workspace works');
    } catch (e) {
      console.log('✗ GET /workspace FAILED:', e.response?.status);
    }

    // Sample packs
    try {
      const packs = await axios.get(`${API}/sample-packs`, cfg);
      console.log('✓ GET /sample-packs works');
    } catch (e) {
      console.log('✗ GET /sample-packs FAILED:', e.response?.status);
    }

    // Transactions
    try {
      const trans = await axios.get(`${API}/transactions`, cfg);
      console.log('✓ GET /transactions works');
    } catch (e) {
      console.log('✗ GET /transactions FAILED:', e.response?.status);
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
