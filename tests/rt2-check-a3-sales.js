// RT2 verification: A3-02 (credit sale), A3-04 (discount), A3-05 (zero qty), A3-06 (null price)
const http = require('http');

const MGR_TOKEN = 'REDACTED_EXPIRED_TEST_TOKEN';

// RT2 Test Rice product (kg, saleByWeight=true, pricePerUnit=45)
const RICE_PRODUCT_ID = '6a0c0e0d6a38eeda4cc00f37';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 5001,
      path: '/api/v1' + path,
      method,
      headers: {
        'Authorization': 'Bearer ' + MGR_TOKEN,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const r = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch(e) { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function main() {
  // === A3-02: Credit/KHATA sale ===
  console.log('=== A3-02: Credit sale with named customer ===');
  const creditSale = await req('POST', '/sales', {
    lines: [{ productId: RICE_PRODUCT_ID, qty: '2', unit: 'kg' }],
    customer: {
      name: 'RT2 Credit Customer',
      phone: '9876543210',
      gstin: ''
    },
    payment: { mode: 'credit' }
  });
  console.log('Credit sale status:', creditSale.status);
  if (creditSale.status !== 201) {
    console.log('Error:', creditSale.data.message || JSON.stringify(creditSale.data).substring(0,300));
  } else {
    const sale = creditSale.data.data || creditSale.data;
    console.log('Sale created:', sale.invoiceNumber || sale._id);
    console.log('Payment mode:', sale.payment ? sale.payment.mode : 'N/A');
    console.log('Grand total:', sale.grandTotal);
  }

  // === A3-04: Discount applied ===
  console.log('\n=== A3-04: Discount field applied to sale total ===');
  // First create a normal sale to compare
  const normalSale = await req('POST', '/sales', {
    lines: [{ productId: RICE_PRODUCT_ID, qty: '2', unit: 'kg' }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' }
  });
  const normalTotal = normalSale.data.data ? normalSale.data.data.grandTotal : null;
  console.log('Normal sale (2kg rice @ 45):', normalSale.status, 'grandTotal:', normalTotal);

  // Now create with discount=20
  const discountSale = await req('POST', '/sales', {
    lines: [{ productId: RICE_PRODUCT_ID, qty: '2', unit: 'kg' }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' },
    discount: 20
  });
  const discountTotal = discountSale.data.data ? discountSale.data.data.grandTotal : null;
  const storedDiscount = discountSale.data.data ? discountSale.data.data.discount : null;
  console.log('Discounted sale (discount=20):', discountSale.status, 'grandTotal:', discountTotal, 'sale.discount:', storedDiscount);

  const normalNum = parseFloat(String(normalTotal).replace(/[^0-9.]/g, ''));
  const discountNum = parseFloat(String(discountTotal).replace(/[^0-9.]/g, ''));

  console.log('\n--- A3-04 VERDICT ---');
  if (discountSale.status === 400) {
    console.log('A3-04: PASS (discount field rejected with 400 — Option A: clean rejection)');
    console.log('Message:', discountSale.data.message);
  } else if (discountSale.status === 201 && discountNum < normalNum) {
    console.log('A3-04: PASS (discount applied, total reduced from', normalNum, 'to', discountNum, ')');
  } else if (discountSale.status === 201 && discountNum === normalNum) {
    console.log('A3-04: FAIL (discount=20 sent but grandTotal unchanged:', discountNum, '— discount silently ignored)');
  } else {
    console.log('A3-04: FAIL status:', discountSale.status, 'message:', discountSale.data.message);
  }

  // === A3-05: Zero-qty line rejected ===
  console.log('\n=== A3-05: Zero-qty line rejected ===');
  const zeroQtySale = await req('POST', '/sales', {
    lines: [{ productId: RICE_PRODUCT_ID, qty: '0', unit: 'kg' }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' }
  });
  console.log('Zero-qty sale status:', zeroQtySale.status, zeroQtySale.data.message || '');

  const zeroQtyPreview = await req('POST', '/sales/preview', {
    lines: [{ productId: RICE_PRODUCT_ID, qty: '0', unit: 'kg' }],
    customer: { name: 'Walk-in' }
  });
  console.log('Zero-qty preview status:', zeroQtyPreview.status, zeroQtyPreview.data.message || '');

  console.log('\n--- A3-05 VERDICT ---');
  console.log('Zero-qty sale rejected:', zeroQtySale.status === 400 ? 'PASS (400)' : 'FAIL (' + zeroQtySale.status + ')');
  console.log('Zero-qty preview rejected:', zeroQtyPreview.status === 400 ? 'PASS (400)' : 'FAIL (' + zeroQtyPreview.status + ')');

  // === A3-06: Null price product gives user-friendly error ===
  console.log('\n=== A3-06: Null-price product gives friendly error ===');
  // Find a product with null pricePerUnit or create one
  const nullPriceProd = await req('POST', '/products', {
    name: 'RT2 NullPrice Product',
    sku: 'RT2-NULLPRICE-001',
    category: 'Test',
    pricePerUnit: 0.001,  // will save as valid but we need null - skip for now, use 0
    unit: 'pcs',
    saleByWeight: false,
    stock: 10,
    barcode: 'RT2NP001'
  });

  // Try to find any product with null price from DB via products list
  const allProds = await req('GET', '/products?limit=100');
  const nullPriceProduct = (allProds.data.data || []).find(p =>
    p.pricePerUnit === null || p.pricePerUnit === '0' || parseFloat(p.pricePerUnit) === 0
  );

  if (nullPriceProduct) {
    console.log('Found product with 0/null price:', nullPriceProduct.name, 'price:', nullPriceProduct.pricePerUnit);
    const salePnull = await req('POST', '/sales', {
      lines: [{ productId: nullPriceProduct._id, qty: '1', unit: nullPriceProduct.unit }],
      customer: { name: 'Walk-in' },
      payment: { mode: 'cash' }
    });
    console.log('Sale with 0-price product:', salePnull.status, salePnull.data.message || '');
    const isUserFriendly = salePnull.data.message && !salePnull.data.message.includes('unsupported type');
    console.log('\n--- A3-06 VERDICT ---');
    console.log('Returns 400:', salePnull.status === 400 ? 'PASS' : 'FAIL (' + salePnull.status + ')');
    console.log('Message is user-friendly (no "unsupported type"):', isUserFriendly ? 'PASS' : 'FAIL - message: ' + salePnull.data.message);
  } else {
    console.log('No null/zero-price product found in DB — checking seeded data...');
    // Check seed data products
    const seedProds = await req('GET', '/products?limit=200');
    const seeded = (seedProds.data.data || []);
    console.log('Total products:', seeded.length);
    const prices = seeded.map(p => ({ name: p.name, price: p.pricePerUnit })).filter(p => !p.price || p.price === '0' || p.price === null);
    console.log('Products with null/0 price:', prices.length, prices.slice(0,3));
  }
}

main().catch(console.error);
