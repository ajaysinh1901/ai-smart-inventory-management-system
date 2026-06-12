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

    // Create product first
    const ts = Date.now();
    const pRes = await axios.post(`${API}/products`, {
      name: 'Test Product',
      sku: `sku-${ts}`,
      barcode: `bc${ts}`,
      price: 100,
      stock: 10,
      category: 'Test',
    }, cfg);
    const productId = pRes.data?.data?._id;
    console.log('Product created:', productId);

    // Create sale
    const saleRes = await axios.post(`${API}/sales`, {
      customer: null,
      paymentMethod: 'cash',
      items: [
        {
          productId,
          qty: 1,
          rate: 100,
        },
      ],
      gst: {
        isInterstate: false,
        cgstRate: 5,
        sgstRate: 5,
      },
    }, cfg);
    console.log('Sale created:', saleRes.data);
  } catch (e) {
    console.error('Error:', e.response?.data || e.message);
  }
  process.exit(0);
})();
