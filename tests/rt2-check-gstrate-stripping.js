// RT2 - Confirm gstRate is stripped by Zod validator on product create
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
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, raw: b }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function main() {
  console.log('=== gstRate Stripping Test ===\n');
  console.log('Sending gstRate:18 in product create body...');

  const r = await req('POST', '/products', {
    name: 'RT2 GST Rate Test',
    sku: 'RT2-GSTRATE-TEST',
    category: 'Test',
    pricePerUnit: 500,
    unit: 'pcs',
    saleByWeight: false,
    stock: 10,
    gstRate: 18,       // <-- THIS SHOULD BE SAVED
    hsnCode: '8471',
    barcode: 'RT2GSTRATE01'
  });

  console.log('Status:', r.status);
  const p = r.data.data;
  console.log('gstRate in response:', p ? p.gstRate : 'N/A');
  console.log('Expected: 18, Got:', p ? p.gstRate : 'N/A');

  console.log('\n--- VERDICT ---');
  if (p && p.gstRate === 18) {
    console.log('PASS: gstRate=18 was saved correctly');
  } else {
    console.log('FAIL: gstRate=' + (p ? p.gstRate : 'N/A') + ' — gstRate field stripped by Zod validator (not in createProductSchema)');
    console.log('Impact: All new products will have gstRate=0, causing all invoices to show 0 GST');
    console.log('Root cause: createProductSchema in product.validator.js is missing gstRate field');
  }

  // Also test PATCH update
  if (p) {
    console.log('\n=== Test: Can we SET gstRate via PATCH? ===');
    const patch = await req('PATCH', '/products/' + p._id, { gstRate: 18 });
    console.log('PATCH gstRate=18 status:', patch.status);
    const patched = patch.data.data;
    console.log('gstRate after patch:', patched ? patched.gstRate : patch.data.message);
  }
}

main().catch(console.error);
