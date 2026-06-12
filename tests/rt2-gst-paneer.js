// RT2 GST Math test using the one product that HAS gstRate set (Paneer)
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
  console.log('=== GST Math Regression - using Paneer product (gstRate=5) ===\n');

  // Find the Paneer product
  const allProds = await req('GET', '/products?limit=100&q=Paneer');
  const paneer = (allProds.data.data || []).find(p => p.gstRate === 5 || (p.name && p.name.includes('Paneer')));

  if (!paneer) {
    console.log('Paneer product not found. Looking for any product with gstRate>0...');
    const allProds2 = await req('GET', '/products?limit=200');
    const gstProds = (allProds2.data.data || []).filter(p => p.gstRate > 0);
    console.log('Products with gstRate>0:', gstProds.map(p => ({ name: p.name, gstRate: p.gstRate, id: p._id })));
    if (gstProds.length === 0) {
      console.log('CRITICAL: No products with gstRate>0 exist in the database!');
      console.log('This means gstRate is never saved (stripped by Zod validator).');
      console.log('ALL sales will show 0 GST - this is a GST Math regression.');
      return;
    }
    return;
  }

  console.log('Found:', paneer.name, '| gstRate:', paneer.gstRate, '| price:', paneer.pricePerUnit, '| unit:', paneer.unit);
  const panId = paneer._id;

  // Test: 0.5kg @ ₹480, 5% GST intrastate
  // Subtotal = 240, CGST = 6 (2.5%), SGST = 6 (2.5%), Total = 252
  console.log('\n--- Test: 0.5 kg Paneer @ ₹480/kg, 5% GST (intrastate Gujarat) ---');
  console.log('Expected: subtotal=240, CGST=6, SGST=6, grandTotal=252');

  const preview = await req('POST', '/sales/preview', {
    lines: [{ productId: panId, qty: '0.5', unit: 'kg' }],
    customer: { name: 'Walk-in', state: 'Gujarat' }
  });

  if (preview.status !== 200) {
    console.log('FAIL preview:', preview.status, preview.data.message);
    return;
  }

  const pData = preview.data;
  const items = pData.items || pData.lines || [];
  const item = items[0] || {};

  const cgst = parseD(item.cgst);
  const sgst = parseD(item.sgst);
  const igst = parseD(item.igst);
  const lineSubtotal = parseD(item.lineSubtotal);
  const lineTotal = parseD(item.lineTotal);
  const grandTotal = parseD(pData.grandTotal);
  const roundOff = parseD(pData.roundOff);

  console.log('\nActual values:');
  console.log('  lineSubtotal:', lineSubtotal, '(expected 240)');
  console.log('  CGST:', cgst, '(expected 6)');
  console.log('  SGST:', sgst, '(expected 6)');
  console.log('  IGST:', igst, '(expected 0)');
  console.log('  lineTotal:', lineTotal, '(expected 252)');
  console.log('  grandTotal:', grandTotal, '(expected 252)');
  console.log('  roundOff:', roundOff);

  const subtotalOk = Math.abs(lineSubtotal - 240) < 0.01;
  const cgstOk = Math.abs(cgst - 6) < 0.01;
  const sgstOk = Math.abs(sgst - 6) < 0.01;
  const igstOk = igst === 0;
  const totalOk = Math.abs(grandTotal - 252) < 1;

  console.log('\n--- GST Math VERDICTS ---');
  console.log('Subtotal=240:', subtotalOk ? 'PASS' : 'FAIL (got ' + lineSubtotal + ')');
  console.log('CGST=6:', cgstOk ? 'PASS' : 'FAIL (got ' + cgst + ')');
  console.log('SGST=6:', sgstOk ? 'PASS' : 'FAIL (got ' + sgst + ')');
  console.log('IGST=0:', igstOk ? 'PASS' : 'FAIL (got ' + igst + ')');
  console.log('GrandTotal=252:', totalOk ? 'PASS' : 'FAIL (got ' + grandTotal + ')');

  // Also test a persisted sale to confirm DB storage
  console.log('\n--- Persisted sale check ---');
  const actualSale = await req('POST', '/sales', {
    lines: [{ productId: panId, qty: '0.5', unit: 'kg' }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' }
  });
  if (actualSale.status === 201) {
    const saleData = actualSale.data.data;
    const si = saleData.items[0];
    console.log('Invoice:', saleData.invoiceNumber);
    console.log('item.cgst stored:', si.cgst, '(expected ~6)');
    console.log('item.sgst stored:', si.sgst, '(expected ~6)');
    console.log('grandTotal stored:', saleData.grandTotal, '(expected 252)');
    const storedCgst = parseD(si.cgst);
    const storedSgst = parseD(si.sgst);
    console.log('\nPersisted CGST=6:', Math.abs(storedCgst - 6) < 0.01 ? 'PASS' : 'FAIL (got ' + storedCgst + ')');
    console.log('Persisted SGST=6:', Math.abs(storedSgst - 6) < 0.01 ? 'PASS' : 'FAIL (got ' + storedSgst + ')');
  } else {
    console.log('Sale creation failed:', actualSale.status, actualSale.data.message);
  }

  // Test: round-off on amount with fractional paise
  // 3 items @ ₹480/kg x 0.333kg = 479.52, 5% = 23.976 → total 503.496 → rounded to 503
  // Actually let's do a price that generates fractional paise for round-off
  console.log('\n--- Round-off test ---');
  const rPreview = await req('POST', '/sales/preview', {
    lines: [{ productId: panId, qty: '0.333', unit: 'kg' }],
    customer: { name: 'Walk-in' }
  });
  if (rPreview.status === 200) {
    const rData = rPreview.data;
    const rItems = rData.items || rData.lines || [];
    const rItem = rItems[0] || {};
    const rRoundOff = parseD(rData.roundOff);
    const rGrandTotal = parseD(rData.grandTotal);
    console.log('0.333kg @ 480: grandTotal=', rGrandTotal, 'roundOff=', rRoundOff);
    console.log('grandTotal is integer:', Number.isInteger(rGrandTotal) ? 'PASS' : 'NOTE: ' + rGrandTotal);
  }
}

main().catch(console.error);
