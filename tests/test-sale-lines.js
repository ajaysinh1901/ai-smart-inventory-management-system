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
    console.log('Using product:', { name: product.name, id: product._id, price: product.price });

    // Try using the new 'lines' format instead of 'items'
    const saleRes = await axios.post(`${API}/sales`, {
      lines: [
        {
          productId: product._id,
          qty: '1.000',
          hsnCode: product.hsnCode || '',
        },
      ],
      gst: {
        isInterstate: false,
        cgstRate: 5,
        sgstRate: 5,
      },
    }, cfg);
    console.log('Sale created:', {
      invoiceNo: saleRes.data?.data?.invoiceNo,
      total: saleRes.data?.data?.grandTotal,
    });
  } catch (e) {
    console.error('Error:', JSON.stringify(e.response?.data, null, 2));
  }
  process.exit(0);
})();
