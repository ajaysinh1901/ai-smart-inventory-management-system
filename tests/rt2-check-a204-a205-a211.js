// RT2 verification: A2-04 (stock-adjustments route), A2-05 (reason='manual'), A2-11 (StockAdjustment model hook)
const http = require('http');

const MGR_TOKEN = 'REDACTED_EXPIRED_TEST_TOKEN';

// Product created in A2-01 test
const PRODUCT_ID = '6a0c0e0d6a38eeda4cc00f37'; // RT2 Test Rice

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
  console.log('=== A2-04: POST /stock-adjustments route exists ===');

  // Test 1: Basic stock-in with reason='purchase-variance'
  const r1 = await req('POST', '/stock-adjustments', {
    productId: PRODUCT_ID,
    qtyChange: 10,
    reason: 'purchase-variance',
    notes: 'RT2 test stock-in'
  });
  console.log('POST /stock-adjustments (purchase-variance):', r1.status, JSON.stringify(r1.data).substring(0, 200));

  // Test 2: A2-05 - reason='manual' should be accepted
  console.log('\n=== A2-05: reason=manual accepted ===');
  const r2 = await req('POST', '/stock-adjustments', {
    productId: PRODUCT_ID,
    qtyChange: 5,
    reason: 'manual',
    notes: 'RT2 manual adjustment test'
  });
  console.log('POST /stock-adjustments (reason=manual):', r2.status, JSON.stringify(r2.data).substring(0, 300));

  // Test 3: GET /stock-adjustments
  console.log('\n=== A2-04: GET /stock-adjustments works ===');
  const r3 = await req('GET', '/stock-adjustments?limit=5');
  console.log('GET /stock-adjustments:', r3.status, 'count:', (r3.data.data || []).length);

  // Test 4: A2-11 - reason='other' without detail should be rejected (hook works)
  console.log('\n=== A2-11: reason=other without reasonDetail -> ValidationError ===');
  const r4 = await req('POST', '/stock-adjustments', {
    productId: PRODUCT_ID,
    qtyChange: 1,
    reason: 'other'
    // no reasonDetail — should fail
  });
  console.log('POST (reason=other, no detail):', r4.status, r4.data.message || JSON.stringify(r4.data).substring(0,200));

  // Test 5: A2-11 - reason='other' WITH detail should succeed
  console.log('\n=== A2-11: reason=other WITH reasonDetail -> should succeed ===');
  const r5 = await req('POST', '/stock-adjustments', {
    productId: PRODUCT_ID,
    qtyChange: 1,
    reason: 'other',
    reasonDetail: 'Testing RT2 other reason'
  });
  console.log('POST (reason=other, with detail):', r5.status, JSON.stringify(r5.data).substring(0, 200));

  console.log('\n--- VERDICTS ---');
  console.log('A2-04 route exists:', r1.status === 201 ? 'PASS (201)' : 'FAIL (' + r1.status + ')');
  console.log('A2-04 GET works:', r3.status === 200 ? 'PASS (200)' : 'FAIL (' + r3.status + ')');
  console.log('A2-05 manual reason:', r2.status === 201 ? 'PASS (201)' : 'FAIL (' + r2.status + ') ' + (r2.data.message || ''));
  console.log('A2-11 other+no detail rejected:', r4.status === 400 ? 'PASS (400)' : 'FAIL (' + r4.status + ')');
  console.log('A2-11 other+detail accepted:', r5.status === 201 ? 'PASS (201)' : 'FAIL (' + r5.status + ')');
}

main().catch(console.error);
