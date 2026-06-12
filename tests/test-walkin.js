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
    const cfg = { headers: { Authorization: `Bearer ${reg.data.token}` } };

    // Get product
    const prodRes = await axios.get(`${API}/products`, cfg);
    const product = prodRes.data?.data?.[0];

    // Try with null customer
    try {
      const saleRes = await axios.post(`${API}/sales`, {
        items: [{ productId: product._id, quantity: 1, unitPrice: 100 }],
        customer: null,
        gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
      }, cfg);
      console.log('Success with null customer');
    } catch (e) {
      console.log('Error with null customer:', JSON.stringify(e.response?.data, null, 2));
    }

    // Try with empty object
    try {
      const saleRes = await axios.post(`${API}/sales`, {
        items: [{ productId: product._id, quantity: 1, unitPrice: 100 }],
        customer: {},
        gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
      }, cfg);
      console.log('Success with empty customer object');
    } catch (e) {
      console.log('Error with empty customer object:', e.response?.data?.message);
    }

    // Try without customer field
    try {
      const saleRes = await axios.post(`${API}/sales`, {
        items: [{ productId: product._id, quantity: 1, unitPrice: 100 }],
        gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
      }, cfg);
      console.log('Success without customer field');
    } catch (e) {
      console.log('Error without customer field:', e.response?.data?.message);
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
