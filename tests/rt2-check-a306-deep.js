// RT2 A3-06 deep dive: null-price product handling
const http = require('http');

const MGR_TOKEN = 'REDACTED_EXPIRED_TEST_TOKEN';

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
  console.log('=== A3-06: Investigating null price product behavior ===');

  // Find the null-price product we just created
  const allProds = await req('GET', '/products?limit=200');
  const nullPriceProduct = (allProds.data.data || []).find(p => p.name === 'RT2 NullPrice Product');
  console.log('RT2 NullPrice Product details:', JSON.stringify(nullPriceProduct, null, 2));

  if (!nullPriceProduct) {
    console.log('Product not found. Checking all prices:');
    const prods = (allProds.data.data || []).slice(0, 5).map(p => ({ name: p.name, price: p.pricePerUnit, id: p._id }));
    console.log(prods);
    return;
  }

  // Try sale with it
  const salePnull = await req('POST', '/sales', {
    lines: [{ productId: nullPriceProduct._id, qty: '1', unit: nullPriceProduct.unit }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' }
  });
  console.log('\nSale status:', salePnull.status);
  console.log('Sale response:', JSON.stringify(salePnull.data).substring(0, 500));

  // Now check what "null" pricePerUnit from seed data looks like
  // Try to find a seeded product with actual null/missing price
  const require_conn = require;
  const mongoose = require_conn('mongoose');
  // We can't do this in the test script - let's check via API
  // The issue from A3-06 was: seed data products with pricePerUnit=null -> "money: unsupported type"
  // Let's see if that error still occurs by looking at seeded products
  const seeded = (allProds.data.data || []);
  console.log('\nChecking seed products for null/0 prices...');
  const zeroPrice = seeded.filter(p => !p.pricePerUnit || parseFloat(p.pricePerUnit) === 0);
  console.log('Products with 0/null/empty pricePerUnit:', zeroPrice.map(p => ({ name: p.name, price: p.pricePerUnit })));

  // Try sale with one of these if they exist
  if (zeroPrice.length > 0) {
    const testProd = zeroPrice[0];
    console.log('\nTrying sale with:', testProd.name, 'price:', testProd.pricePerUnit);
    const sale2 = await req('POST', '/sales', {
      lines: [{ productId: testProd._id, qty: '1', unit: testProd.unit }],
      customer: { name: 'Walk-in' },
      payment: { mode: 'cash' }
    });
    console.log('Sale2 status:', sale2.status, 'message:', sale2.data.message || JSON.stringify(sale2.data).substring(0,200));
  }

  console.log('\n--- A3-06 Analysis ---');
  console.log('A product created with pricePerUnit=0.001 gets rounded to 0 in Decimal128');
  console.log('A sale with pricePerUnit=0 succeeds (creates ₹0 invoice) — no validation');
  console.log('The original bug was: null pricePerUnit -> "money: unsupported type" error');
  console.log('Need to find a product where pricePerUnit is truly null (not 0)');
}

main().catch(console.error);
