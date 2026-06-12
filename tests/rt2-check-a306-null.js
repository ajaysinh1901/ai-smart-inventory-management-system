// RT2 A3-06: Test actual null-price product
const http = require('http');

const MGR_TOKEN = 'REDACTED_EXPIRED_TEST_TOKEN';

// Dell Inspiron 15 - has null pricePerUnit from seed
const NULL_PRICE_PRODUCT_ID = '69f0569e7e47054083def2be';

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
  console.log('=== A3-06: Sale with truly null pricePerUnit product ===');
  console.log('Using: Dell Inspiron 15 3520 i5 (ID:', NULL_PRICE_PRODUCT_ID, ')');

  const sale = await req('POST', '/sales', {
    lines: [{ productId: NULL_PRICE_PRODUCT_ID, qty: '1', unit: 'pcs' }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' }
  });

  console.log('Status:', sale.status);
  console.log('Message:', sale.data.message || '(none)');
  console.log('Full response (first 300):', JSON.stringify(sale.data).substring(0, 300));

  const msg = sale.data.message || '';
  const isOpaque = msg.includes('unsupported type') || msg.includes('Cannot convert');
  const isFriendly = msg.length > 0 && !isOpaque;
  const isCorrectStatus = sale.status === 400;

  console.log('\n--- A3-06 VERDICT ---');
  console.log('Returns 400:', isCorrectStatus ? 'PASS' : 'FAIL (' + sale.status + ')');
  console.log('Message is user-friendly:', isFriendly ? 'PASS - "' + msg + '"' : 'FAIL - message: "' + msg + '"');
  if (isOpaque) console.log('STILL shows opaque internal error: FAIL');

  // Also test preview endpoint
  const preview = await req('POST', '/sales/preview', {
    lines: [{ productId: NULL_PRICE_PRODUCT_ID, qty: '1', unit: 'pcs' }],
    customer: { name: 'Walk-in' }
  });
  console.log('\nPreview status:', preview.status, 'message:', preview.data.message || '');
}

main().catch(console.error);
