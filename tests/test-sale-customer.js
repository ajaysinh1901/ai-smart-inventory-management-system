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

    // Get existing product
    const prodRes = await axios.get(`${API}/products`, cfg);
    const product = prodRes.data?.data?.[0];

    // Try with proper customer object
    const saleRes = await axios.post(`${API}/sales`, {
      lines: [
        {
          productId: product._id,
          qty: '1.000',
        },
      ],
      customer: { name: 'Walk-in' },
      payment: { mode: 'cash' },
      gst: {
        isInterstate: false,
        cgstRate: 5,
        sgstRate: 5,
      },
    }, cfg);
    console.log('Sale created:', saleRes.data?.data?.invoiceNo);
  } catch (e) {
    console.error('Error:', JSON.stringify(e.response?.data, null, 2));
  }
  process.exit(0);
})();
