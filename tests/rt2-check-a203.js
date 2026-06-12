// RT2 verification script for A2-03: stock_status filter
const http = require('http');

const MGR_TOKEN = 'REDACTED_EXPIRED_TEST_TOKEN';

function get(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 5001,
      path: '/api/v1' + path,
      headers: { 'Authorization': 'Bearer ' + MGR_TOKEN }
    };
    http.get(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch(e) { resolve({ status: res.statusCode, raw: body }); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== A2-03: stock_status filter correctness ===');

  // Test with limit=2 (should still return out-of-stock items)
  const r2 = await get('/products?stock_status=out&page=1&limit=2');
  const items2 = r2.data.data || [];
  const meta2 = r2.data.meta || {};
  console.log('\nlimit=2:');
  console.log('  Items returned:', items2.length);
  console.log('  meta.total:', meta2.total);
  console.log('  Item names:', items2.map(p => p.name + ' (stock=' + p.stock + ')'));

  // Test with limit=1000 (control)
  const r1000 = await get('/products?stock_status=out&page=1&limit=1000');
  const items1000 = r1000.data.data || [];
  const meta1000 = r1000.data.meta || {};
  console.log('\nlimit=1000:');
  console.log('  Items returned:', items1000.length);
  console.log('  meta.total:', meta1000.total);

  // Check: with limit=2, we should see 2 out-of-stock items (not 0)
  // and meta.total should be same as limit=1000 items count
  console.log('\n--- VERDICT ---');
  if (items2.length > 0) {
    console.log('PASS: limit=2 returns', items2.length, 'out-of-stock item(s) — filter is DB-level');
  } else {
    console.log('FAIL: limit=2 returns 0 items — filter is still in-memory post-pagination');
  }

  if (meta2.total !== undefined && meta2.total == items1000.length) {
    console.log('PASS: meta.total (' + meta2.total + ') matches actual out-of-stock count (' + items1000.length + ')');
  } else {
    console.log('FAIL: meta.total (' + meta2.total + ') does NOT match actual out-of-stock count (' + items1000.length + ')');
  }
}

main().catch(console.error);
