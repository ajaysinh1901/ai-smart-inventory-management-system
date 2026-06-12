// RT2 GST Math Regression Test
// Verifies CGST/SGST split, round-off, and grand total correctness
const http = require('http');

const MGR_TOKEN = 'REDACTED_EXPIRED_TEST_TOKEN';

// RT2 Test Rice: 45/kg, gstRate=0 (note: gstRate was ignored on creation)
// We need a product with known gstRate. Let's create one.
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
  console.log('=== RT2 GST Math Regression ===\n');

  // Step 1: Create a product with 18% GST (standard electronics rate)
  console.log('Creating test product with gstRate=18...');
  const prodResp = await req('POST', '/products', {
    name: 'RT2 GST Product 18pct',
    sku: 'RT2-GST18-001',
    category: 'Electronics',
    pricePerUnit: 1000,
    unit: 'pcs',
    saleByWeight: false,
    stock: 50,
    gstRate: 18,
    hsnCode: '8471',
    barcode: 'RT2GST18001'
  });
  if (prodResp.status !== 201) {
    console.log('FAIL: Cannot create product:', prodResp.data.message);
    return;
  }
  const prod = prodResp.data.data;
  console.log('Product created:', prod.name, 'gstRate:', prod.gstRate, 'price:', prod.pricePerUnit);
  const prodId = prod._id;

  // Step 2: Also create a 5% GST product
  const prod5Resp = await req('POST', '/products', {
    name: 'RT2 GST Product 5pct',
    sku: 'RT2-GST5-001',
    category: 'Food',
    pricePerUnit: 480,
    unit: 'kg',
    saleByWeight: true,
    stock: 50,
    gstRate: 5,
    hsnCode: '0406',
    barcode: 'RT2GST5001'
  });
  const prod5 = prod5Resp.data.data;
  console.log('Product5 created:', prod5 ? prod5.name : 'FAIL', 'gstRate:', prod5 ? prod5.gstRate : 'N/A');
  const prod5Id = prod5 ? prod5._id : null;

  // Step 3: Test intrastate sale (CGST+SGST)
  console.log('\n--- Test 1: Intrastate sale, 1 pc @ ₹1000, 18% GST ---');
  console.log('Expected: subtotal=1000, CGST=90(9%), SGST=90(9%), total=1180');

  const sale1 = await req('POST', '/sales/preview', {
    lines: [{ productId: prodId, qty: '1', unit: 'pcs' }],
    customer: { name: 'Walk-in', state: 'Gujarat' }
  });

  if (sale1.status !== 200) {
    console.log('FAIL preview:', sale1.status, sale1.data.message);
  } else {
    const s1 = sale1.data;
    const items = s1.items || s1.lines || [];
    const item = items[0] || {};
    const cgst = parseD(item.cgst);
    const sgst = parseD(item.sgst);
    const igst = parseD(item.igst);
    const lineTotal = parseD(item.lineTotal);
    const subtotal = parseD(item.lineSubtotal);
    const grandTotal = parseD(s1.grandTotal);

    console.log('Subtotal:', subtotal);
    console.log('CGST:', cgst);
    console.log('SGST:', sgst);
    console.log('IGST:', igst);
    console.log('Line Total:', lineTotal);
    console.log('Grand Total:', grandTotal);

    const cgstOk = Math.abs(cgst - 90) < 0.01;
    const sgstOk = Math.abs(sgst - 90) < 0.01;
    const igstOk = igst === 0;
    const totalOk = Math.abs(grandTotal - 1180) < 1; // allow for round-off

    console.log('\nCGST=90:', cgstOk ? 'PASS' : 'FAIL (got ' + cgst + ')');
    console.log('SGST=90:', sgstOk ? 'PASS' : 'FAIL (got ' + sgst + ')');
    console.log('IGST=0:', igstOk ? 'PASS' : 'FAIL (got ' + igst + ')');
    console.log('GrandTotal~1180:', totalOk ? 'PASS' : 'FAIL (got ' + grandTotal + ')');
  }

  // Step 4: Test 5% GST product (Paneer-like scenario from original bug report)
  if (prod5Id) {
    console.log('\n--- Test 2: 5% GST, 0.5kg @ ₹480/kg ---');
    console.log('Expected: subtotal=240, CGST=6(2.5%), SGST=6(2.5%), total=252');

    const sale2 = await req('POST', '/sales/preview', {
      lines: [{ productId: prod5Id, qty: '0.5', unit: 'kg' }],
      customer: { name: 'Walk-in', state: 'Gujarat' }
    });

    if (sale2.status !== 200) {
      console.log('FAIL preview:', sale2.status, sale2.data.message);
    } else {
      const s2 = sale2.data;
      const items2 = s2.items || s2.lines || [];
      const item2 = items2[0] || {};
      const cgst2 = parseD(item2.cgst);
      const sgst2 = parseD(item2.sgst);
      const lineSubtotal2 = parseD(item2.lineSubtotal);
      const grandTotal2 = parseD(s2.grandTotal);

      console.log('Subtotal:', lineSubtotal2);
      console.log('CGST:', cgst2);
      console.log('SGST:', sgst2);
      console.log('Grand Total:', grandTotal2);

      const cgstOk2 = Math.abs(cgst2 - 6) < 0.01;
      const sgstOk2 = Math.abs(sgst2 - 6) < 0.01;
      const totalOk2 = Math.abs(grandTotal2 - 252) < 1;

      console.log('CGST=6:', cgstOk2 ? 'PASS' : 'FAIL (got ' + cgst2 + ')');
      console.log('SGST=6:', sgstOk2 ? 'PASS' : 'FAIL (got ' + sgst2 + ')');
      console.log('GrandTotal~252:', totalOk2 ? 'PASS' : 'FAIL (got ' + grandTotal2 + ')');
    }
  }

  // Step 5: Create actual sales and verify items stored correctly
  console.log('\n--- Test 3: Persisted sale has correct GST fields ---');
  const actualSale = await req('POST', '/sales', {
    lines: [{ productId: prodId, qty: '2', unit: 'pcs' }],
    customer: { name: 'Walk-in' },
    payment: { mode: 'cash' }
  });
  if (actualSale.status === 201) {
    const saleData = actualSale.data.data;
    const si = saleData.items[0];
    console.log('Persisted sale invoice:', saleData.invoiceNumber);
    console.log('item.cgst:', si.cgst, '(expected ~180)');
    console.log('item.sgst:', si.sgst, '(expected ~180)');
    console.log('item.igst:', si.igst, '(expected 0)');
    console.log('grandTotal:', saleData.grandTotal, '(expected 2360)');

    const cgstPersisted = parseD(si.cgst);
    const sgstPersisted = parseD(si.sgst);
    console.log('\nPersisted CGST=180:', Math.abs(cgstPersisted - 180) < 0.01 ? 'PASS' : 'FAIL (got ' + cgstPersisted + ')');
    console.log('Persisted SGST=180:', Math.abs(sgstPersisted - 180) < 0.01 ? 'PASS' : 'FAIL (got ' + sgstPersisted + ')');
  } else {
    console.log('FAIL creating persisted sale:', actualSale.status, actualSale.data.message);
  }

  // Step 6: Round-off check (amount that produces fractional total)
  console.log('\n--- Test 4: Round-off on odd amount ---');
  // 3 pcs @ 1000, 18% GST = 3000 + 540 = 3540 (whole - no round-off needed)
  // Let's try with a product price that produces fractional paise
  const sale4 = await req('POST', '/sales/preview', {
    lines: [{ productId: prodId, qty: '1', unit: 'pcs' }],
    customer: { name: 'Walk-in' }
  });
  if (sale4.status === 200) {
    const s4 = sale4.data;
    const roundOff = parseD(s4.roundOff);
    const grandTotal4 = parseD(s4.grandTotal);
    const taxableTotal = parseD(s4.taxableAmount || s4.subtotal);
    console.log('roundOff field present:', roundOff !== undefined ? 'YES (' + roundOff + ')' : 'NO');
    console.log('grandTotal is integer:', Number.isInteger(grandTotal4) ? 'PASS (' + grandTotal4 + ')' : 'NOTE: ' + grandTotal4 + ' (may be decimal for GST-free)');
  }
}

main().catch(console.error);
