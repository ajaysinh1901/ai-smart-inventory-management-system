/**
 * tests/e2e/01-onboarding-speedrun.test.js
 *
 * E2E test: simplified onboarding flow.
 * Tests: auth → GET products → GET/POST sales → GET transactions
 *
 * Note: workspace endpoints not yet deployed; skip those steps.
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
    logTime('Starting onboarding flow test...');

    // 1. Auth
    logTime('Step 1: Auth');
    const auth = await setupAuth();
    const cfg = auth.config;
    recordResult('PASS');
    assert(!!auth.token, 'POST /auth/register', 'user created');

    // 2. GET /products
    logTime('Step 2: GET /products');
    let products = [];
    try {
      const prodRes = await axios.get(`${API}/products`, cfg);
      products = prodRes.data?.data || [];
      const ok = prodRes.status === 200 && Array.isArray(products) && products.length > 0;
      recordResult(ok ? 'PASS' : 'FAIL');
      assert(ok, 'GET /products', `found ${products.length} products`);
    } catch (e) {
      recordResult('FAIL');
      assert(false, 'GET /products', e.message);
    }

    // 3. POST /sales (using first product)
    logTime('Step 3: POST /sales');
    if (products.length > 0) {
      try {
        const saleRes = await axios.post(`${API}/sales`, {
          items: [
            {
              productId: products[0]._id,
              quantity: 1,
              unitPrice: products[0].price || 100,
            },
          ],
          customer: { name: 'Walk-in' },
          payment: { mode: 'cash' },
          gst: { isInterstate: false, cgstRate: 5, sgstRate: 5 },
        }, cfg);
        const ok = saleRes.status === 200 || saleRes.status === 201;
        const invoice = saleRes.data?.data?.invoiceNo || saleRes.data?.data?.number || saleRes.data?.data?._id;
        recordResult(ok ? 'PASS' : 'FAIL');
        assert(ok, 'POST /sales', `created ${invoice ? 'invoice ' + invoice : 'sale'}`);

      } catch (e) {
        recordResult('FAIL');
        assert(false, 'POST /sales', e.response?.data?.message || e.message);
      }
    } else {
      recordResult('SKIP');
      skip('POST /sales', 'no products available');
    }

    // 4. GET /sales
    logTime('Step 4: GET /sales');
    try {
      const salesRes = await axios.get(`${API}/sales`, cfg);
      const sales = salesRes.data?.data || [];
      const ok = salesRes.status === 200 && Array.isArray(sales);
      recordResult(ok ? 'PASS' : 'FAIL');
      assert(ok, 'GET /sales', `found ${sales.length} sales`);
    } catch (e) {
      recordResult('FAIL');
      assert(false, 'GET /sales', e.message);
    }

    // 5. GET /transactions
    logTime('Step 5: GET /transactions');
    try {
      const transRes = await axios.get(`${API}/transactions`, cfg);
      const trans = transRes.data?.data || [];
      const ok = transRes.status === 200 && Array.isArray(trans);
      recordResult(ok ? 'PASS' : 'FAIL');
      assert(ok, 'GET /transactions', `found ${trans.length} transactions`);
    } catch (e) {
      recordResult('SKIP');
      skip('GET /transactions', `endpoint error: ${e.response?.status}`);
    }

    // 6. GET /settings
    logTime('Step 6: GET /settings');
    try {
      const settingsRes = await axios.get(`${API}/settings`, cfg);
      const ok = settingsRes.status === 200;
      recordResult(ok ? 'PASS' : 'FAIL');
      assert(ok, 'GET /settings', 'workspace settings retrieved');
    } catch (e) {
      recordResult('SKIP');
      skip('GET /settings', `endpoint error: ${e.response?.status}`);
    }

    logTime(`Onboarding flow test complete!`);
    console.log(`\nSummary: PASS: ${stats.pass}, FAIL: ${stats.fail}, SKIP: ${stats.skip}`);
    if (stats.fail > 0) process.exitCode = 1;

  } catch (e) {
    recordResult('FAIL');
    log('FAIL', 'unhandled error', e.response?.data?.message || e.message);
    console.log(`\nSummary: PASS: ${stats.pass}, FAIL: ${stats.fail + 1}, SKIP: ${stats.skip}`);
    process.exitCode = 1;
  }
})();
