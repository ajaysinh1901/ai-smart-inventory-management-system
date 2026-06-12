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

    // Get products
    const pRes = await axios.get(`${API}/products`, cfg);
    const products = pRes.data?.data || [];
    console.log('Found', products.length, 'products');
    console.log('Sample:', JSON.stringify(products[0], null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
