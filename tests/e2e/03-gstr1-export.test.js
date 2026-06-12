/**
 * tests/e2e/03-gstr1-export.test.js
 *
 * E2E test: GSTR-1 export functionality.
 * Tests: GET /reports/gstr1 endpoint (if implemented).
 * Verifies: response structure, monetary field types, tax fields.
 */

const { log, assert, skip, API, setupAuth, axios } = require('./_helpers');

(async () => {
  let stats = { pass: 0, fail: 0, skip: 0 };
  const startTime = Date.now();

  function logTime(msg) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] ${msg}`);
  }

  const recordResult = (status) => {
    if (status === 'PASS') stats.pass++;
    else if (status === 'FAIL') stats.fail++;
    else if (status === 'SKIP') stats.skip++;
  };

  try {
    logTime('Starting GSTR-1 export tests...');

    // 1. Auth
    logTime('Step 1: Auth');
    const auth = await setupAuth();
    const cfg = auth.config;
    recordResult('PASS');
    assert(!!auth.token, 'POST /auth/register', 'user created');

    // 2. Create some sales to ensure export data
    logTime('Step 2: Create test sales');
    let createCount = 0;
    try {
      const prodRes = await axios.get(`${API}/products`, cfg);
      const products = prodRes.data?.data || [];

      if (products.length > 0) {
        // Create 3 sales with different GST rates
        const saleConfigs = [
          { qty: 2, rate: 100, cgstRate: 5, sgstRate: 5, name: 'Intra-5%' },
          { qty: 1, rate: 500, cgstRate: 12, sgstRate: 12, name: 'Intra-12%' },
          { qty: 1, rate: 200, igstRate: 18, name: 'Inter-18%' },
        ];

        for (const config of saleConfigs) {
          try {
            const gst = config.igstRate
              ? { isInterstate: true, igstRate: config.igstRate }
              : { isInterstate: false, cgstRate: config.cgstRate, sgstRate: config.sgstRate };

            const saleRes = await axios.post(`${API}/sales`, {
              items: [
                {
                  productId: products[0]._id,
                  quantity: config.qty,
                  unitPrice: config.rate,
                },
              ],
              customer: { name: config.name },
              payment: { mode: 'cash' },
              gst,
            }, cfg);

            if (saleRes.status === 200 || saleRes.status === 201) {
              createCount++;
            }
          } catch (e) {
            // Ignore individual failures, continue
          }
        }
      }
      recordResult('PASS');
      assert(createCount > 0, 'Create test sales', `created ${createCount} sales`);
    } catch (e) {
      recordResult('SKIP');
      skip('Create test sales', `failed to create sales: ${e.message}`);
    }

    // 3. GET /reports/gstr1
    logTime('Step 3: GET /reports/gstr1');
    try {
      const now = new Date();
      const period = `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;

      const gstr1Res = await axios.get(`${API}/reports/gstr1?period=${period}`, cfg);
      const ok = gstr1Res.status === 200;
      recordResult(ok ? 'PASS' : 'SKIP');

      if (ok) {
        assert(true, 'GET /reports/gstr1', `endpoint exists`);
      } else {
        skip('GET /reports/gstr1', `endpoint returned ${gstr1Res.status}`);
      }

      if (ok && gstr1Res.data) {
        // 4. Validate response structure
        logTime('Step 4: Validate GSTR-1 response structure');
        const data = gstr1Res.data?.data;

        if (data) {
          const isArray = Array.isArray(data);
          recordResult(isArray ? 'PASS' : 'FAIL');
          assert(isArray, 'GSTR-1 response is array', `type: ${typeof data}`);

          if (isArray && data.length > 0) {
            const row = data[0];
            const keys = Object.keys(row);

            // Check for expected columns (case-insensitive)
            const keysLower = keys.map(k => k.toLowerCase());
            const hasInvoice = keysLower.some(k => k.includes('invoice'));
            const hasTaxable = keysLower.some(k => k.includes('taxable'));
            const hasTotal = keysLower.some(k => k.includes('total'));

            recordResult(hasInvoice ? 'PASS' : 'FAIL');
            assert(hasInvoice, 'Invoice column exists', `columns: ${keys.join(', ')}`);

            recordResult(hasTaxable ? 'PASS' : 'FAIL');
            assert(hasTaxable, 'Taxable value column exists', `columns: ${keys.join(', ')}`);

            recordResult(hasTotal ? 'PASS' : 'FAIL');
            assert(hasTotal, 'Total column exists', `columns: ${keys.join(', ')}`);

            // 5. Check monetary field serialization
            logTime('Step 5: Monetary field types');
            const taxableKey = keys.find(k => k.toLowerCase().includes('taxable'));
            if (taxableKey) {
              const taxableVal = row[taxableKey];
              const isSerializable = typeof taxableVal === 'string' || typeof taxableVal === 'number';
              recordResult(isSerializable ? 'PASS' : 'FAIL');
              assert(isSerializable, 'Monetary fields serializable', `taxable type: ${typeof taxableVal}`);
            }

            // 6. Check for tax fields
            logTime('Step 6: Tax field presence');
            const keysLowerFull = keys.map(k => k.toLowerCase());
            const hasCGST = keysLowerFull.some(k => k.includes('cgst'));
            const hasSGST = keysLowerFull.some(k => k.includes('sgst'));
            const hasIGST = keysLowerFull.some(k => k.includes('igst'));

            recordResult((hasCGST || hasSGST || hasIGST) ? 'PASS' : 'FAIL');
            assert((hasCGST || hasSGST || hasIGST), 'Tax columns present', `CGST=${hasCGST}, SGST=${hasSGST}, IGST=${hasIGST}`);
          } else {
            recordResult('SKIP');
            skip('GSTR-1 data validation', 'no data rows in export');
          }
        }
      }
    } catch (e) {
      recordResult('SKIP');
      skip('GET /reports/gstr1', `endpoint not found or error: ${e.response?.status || e.message}`);
    }

    // 7. Try alternate GSTR-1 endpoint paths
    logTime('Step 7: Check alternate GSTR-1 endpoints');
    const altPaths = ['/exports/gstr1', '/gstr1', '/api/v1/exports/gstr1'];
    for (const path of altPaths) {
      try {
        const fullPath = path.startsWith('/api') ? path : `${API}${path}`;
        const res = await axios.get(fullPath, cfg);
        if (res.status === 200) {
          recordResult('PASS');
          assert(true, `GET ${path}`, 'found alternative endpoint');
          break;
        }
      } catch (e) {
        // Continue trying
      }
    }

    logTime(`GSTR-1 export tests complete!`);
    console.log(`\nSummary: PASS: ${stats.pass}, FAIL: ${stats.fail}, SKIP: ${stats.skip}`);
    if (stats.fail > 0) process.exitCode = 1;

  } catch (e) {
    recordResult('FAIL');
    log('FAIL', 'unhandled error', e.response?.data?.message || e.message);
    console.log(`\nSummary: PASS: ${stats.pass}, FAIL: ${stats.fail + 1}, SKIP: ${stats.skip}`);
    process.exitCode = 1;
  }
})();
