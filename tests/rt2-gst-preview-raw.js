// RT2 - check raw preview response structure
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
  // Paneer product ID
  const allProds = await req('GET', '/products?q=Paneer&limit=5');
  const paneer = (allProds.data.data || []).find(p => p.gstRate === 5);
  if (!paneer) { console.log('Paneer not found'); return; }

  console.log('Paneer ID:', paneer._id, 'gstRate:', paneer.gstRate);

  const preview = await req('POST', '/sales/preview', {
    lines: [{ productId: paneer._id, qty: '0.5', unit: 'kg' }],
    customer: { name: 'Walk-in', state: 'Gujarat' }
  });

  console.log('\nPreview status:', preview.status);
  console.log('Full preview response:');
  console.log(JSON.stringify(preview.data, null, 2));
}

main().catch(console.error);
