// RT2 verification: A2-06 (low-stock filter) and A2-07 (Supplier model validation)
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
  console.log('=== A2-06: /products/low-stock excludes reorderLevel=0 ===');

  // Create a product with stock=0 AND reorderLevel=0 (false alert candidate)
  const rCreate = await req('POST', '/products', {
    name: 'RT2 Zero Threshold',
    sku: 'RT2-ZERO-RL',
    category: 'Test',
    pricePerUnit: 10,
    unit: 'pcs',
    saleByWeight: false,
    stock: 0,
    reorderLevel: 0,
    barcode: 'RT2ZERO001'
  });
  console.log('Created zero-threshold product:', rCreate.status, rCreate.data.data ? rCreate.data.data.name : rCreate.data.message);
  const zeroProductId = rCreate.data.data ? rCreate.data.data._id : null;

  // Create a product with stock=3, reorderLevel=5 (SHOULD appear in low-stock)
  const rLow = await req('POST', '/products', {
    name: 'RT2 Low Stock Product',
    sku: 'RT2-LOW-001',
    category: 'Test',
    pricePerUnit: 20,
    unit: 'pcs',
    saleByWeight: false,
    stock: 3,
    reorderLevel: 5,
    barcode: 'RT2LOW001'
  });
  console.log('Created low-stock product:', rLow.status, rLow.data.data ? rLow.data.data.name : rLow.data.message);
  const lowProductId = rLow.data.data ? rLow.data.data._id : null;

  // Check /products/low-stock
  const rLS = await req('GET', '/products/low-stock');
  console.log('\nGET /products/low-stock status:', rLS.status);
  const lsItems = rLS.data.data || rLS.data || [];
  const names = lsItems.map(p => p.name);
  console.log('Low-stock items count:', lsItems.length);
  console.log('Contains RT2 Zero Threshold:', names.includes('RT2 Zero Threshold'));
  console.log('Contains RT2 Low Stock Product:', names.includes('RT2 Low Stock Product'));

  console.log('\n--- VERDICTS ---');
  const hasZero = names.includes('RT2 Zero Threshold');
  const hasLow = names.includes('RT2 Low Stock Product');
  console.log('A2-06 zero-threshold excluded:', !hasZero ? 'PASS' : 'FAIL (false alert: RT2 Zero Threshold appears in low-stock)');
  console.log('A2-06 real low-stock included:', hasLow ? 'PASS' : 'FAIL (RT2 Low Stock Product missing from low-stock)');

  // === A2-07: Supplier model validation ===
  console.log('\n=== A2-07: Supplier model rejects bad GSTIN ===');

  const rBadGst = await req('POST', '/suppliers', {
    name: 'RT2 Bad GSTIN Supplier',
    email: 'test@valid.com',
    gst: 'INVALID-GST'  // should fail
  });
  console.log('POST supplier bad GSTIN:', rBadGst.status, rBadGst.data.message || JSON.stringify(rBadGst.data).substring(0,150));

  console.log('\n=== A2-07: Supplier model rejects bad email ===');
  const rBadEmail = await req('POST', '/suppliers', {
    name: 'RT2 Bad Email Supplier',
    email: 'not-an-email',
    gst: '24AABCP5566N1Z3'  // valid GSTIN format
  });
  console.log('POST supplier bad email:', rBadEmail.status, rBadEmail.data.message || JSON.stringify(rBadEmail.data).substring(0,150));

  console.log('\n=== A2-07: Supplier model accepts valid data ===');
  const rGood = await req('POST', '/suppliers', {
    name: 'RT2 Valid Supplier',
    email: 'rt2@supplier.com',
    gst: '24AABCP5566N1Z3'
  });
  console.log('POST supplier valid:', rGood.status, rGood.data.data ? 'Created: ' + rGood.data.data.name : rGood.data.message);

  console.log('\n--- A2-07 VERDICTS ---');
  console.log('Bad GSTIN rejected:', rBadGst.status === 400 ? 'PASS (400)' : 'FAIL (' + rBadGst.status + ')');
  console.log('Bad email rejected:', rBadEmail.status === 400 ? 'PASS (400)' : 'FAIL (' + rBadEmail.status + ')');
  console.log('Valid supplier accepted:', rGood.status === 201 ? 'PASS (201)' : 'FAIL (' + rGood.status + ')');
}

main().catch(console.error);
