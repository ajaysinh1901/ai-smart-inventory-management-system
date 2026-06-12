// RT2 - Verify intrastate vs interstate GST split behavior
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

function parseD(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'object' && val.$numberDecimal) return parseFloat(val.$numberDecimal);
  return parseFloat(String(val)) || 0;
}

async function main() {
  const allProds = await req('GET', '/products?q=Paneer&limit=5');
  const paneer = (allProds.data.data || []).find(p => p.gstRate === 5);
  if (!paneer) { console.log('Paneer not found'); return; }
  const panId = paneer._id;

  // Check workspace state
  const ws = await req('GET', '/workspace');
  console.log('Workspace state:', ws.data.data ? ws.data.data.state : ws.data.state || 'N/A');

  // TEST 1: Preview without state (no customer state) - should be intrastate if workspace=Gujarat
  console.log('\n--- Preview: no customer state ---');
  const p1 = await req('POST', '/sales/preview', {
    lines: [{ productId: panId, qty: '0.5', unit: 'kg' }],
    customer: { name: 'Walk-in' }
  });
  const d1 = p1.data.data || {};
  const l1 = (d1.lines || d1.items || [])[0] || {};
  console.log('intraState:', d1.intraState);
  console.log('CGST:', l1.cgst, 'SGST:', l1.sgst, 'IGST:', l1.igst);

  // TEST 2: Preview with Gujarat state
  console.log('\n--- Preview: customer state=Gujarat ---');
  const p2 = await req('POST', '/sales/preview', {
    lines: [{ productId: panId, qty: '0.5', unit: 'kg' }],
    customer: { name: 'Gujarat Customer', state: 'Gujarat' }
  });
  const d2 = p2.data.data || {};
  const l2 = (d2.lines || d2.items || [])[0] || {};
  console.log('intraState:', d2.intraState);
  console.log('CGST:', l2.cgst, 'SGST:', l2.sgst, 'IGST:', l2.igst);

  // TEST 3: Preview with Maharashtra state (should be IGST)
  console.log('\n--- Preview: customer state=Maharashtra (interstate) ---');
  const p3 = await req('POST', '/sales/preview', {
    lines: [{ productId: panId, qty: '0.5', unit: 'kg' }],
    customer: { name: 'MH Customer', state: 'Maharashtra' }
  });
  const d3 = p3.data.data || {};
  const l3 = (d3.lines || d3.items || [])[0] || {};
  console.log('intraState:', d3.intraState);
  console.log('CGST:', l3.cgst, 'SGST:', l3.sgst, 'IGST:', l3.igst);

  // TEST 4: Actual persisted sale (no customer state) - check stored values
  console.log('\n--- Actual sale: no customer state - check persisted values ---');
  const sale = await req('POST', '/sales', {
    lines: [{ productId: panId, qty: '0.5', unit: 'kg' }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' }
  });
  if (sale.status === 201) {
    const sd = sale.data.data;
    const si = sd.items[0];
    console.log('intraState:', sd.intraState);
    console.log('CGST stored:', si.cgst, 'SGST stored:', si.sgst, 'IGST stored:', si.igst);
    console.log('grandTotal:', sd.grandTotal);
  }

  // Summary
  console.log('\n=== GST Math Summary ===');
  console.log('The core issue: when workspace state is not set/Gujarat, intraState logic differs between preview and create');
  console.log('');
  console.log('Preview (no state):', 'intraState='+((p1.data.data||{}).intraState));
  console.log('Preview (Gujarat):', 'intraState='+((p2.data.data||{}).intraState));
  console.log('Preview (Maharashtra):', 'intraState='+((p3.data.data||{}).intraState));
}

main().catch(console.error);
