const axios = require('axios');

(async () => {
  const API = 'http://localhost:5000/api/v1';
  
  try {
    // Auth
    const reg = await axios.post(`${API}/auth/register`, {
      email: `test-${Date.now()}@test.com`,
      password: 'Test@123456',
      name: 'Test'
    });
    const token = reg.data.token;
    const cfg = { headers: { Authorization: `Bearer ${token}` } };

    // Try to create product
    const pRes = await axios.post(`${API}/products`, {
      name: 'Test Product',
      sku: 'TEST-001',
      price: '100.00',
      category: 'Test',
      stock: 10,
    }, cfg);
    console.log('Success:', pRes.data);
  } catch (e) {
    console.error('Error:', e.response?.data);
  }
  process.exit(0);
})();
