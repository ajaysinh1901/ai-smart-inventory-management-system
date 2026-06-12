const axios = require('axios');

(async () => {
  const API = 'http://localhost:5000/api/v1';
  
  try {
    // Auth with fresh user
    const email = `test-${Math.random().toString(36).substring(7)}-${Date.now()}@test.com`;
    const reg = await axios.post(`${API}/auth/register`, {
      email,
      password: 'Test@123456',
      name: 'Test'
    });
    const token = reg.data.token;
    const cfg = { headers: { Authorization: `Bearer ${token}` } };
    console.log('Registered:', email);

    // Create product - use completely unique values
    const rnd = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const prod = {
      name: `Prod-${rnd}`,
      sku: `SK-${rnd}`,
      price: 100,
      stock: 10,
      category: 'TEST',
      // Try without barcode
    };
    
    console.log('Creating product:', prod);
    const pRes = await axios.post(`${API}/products`, prod, cfg);
    const productId = pRes.data?.data?._id;
    console.log('Product created:', productId);

    // Now create sale
    const saleRes = await axios.post(`${API}/sales`, {
      customer: null,
      paymentMethod: 'cash',
      items: [{ productId, qty: 1, rate: 100 }],
      gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
    }, cfg);
    console.log('Sale created, invoice:', saleRes.data?.data?.invoiceNo);
  } catch (e) {
    console.error('Error:', e.response?.data || e.message);
  }
  process.exit(0);
})();
