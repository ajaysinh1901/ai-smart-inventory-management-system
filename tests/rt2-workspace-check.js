const http = require('http');
const MGR_TOKEN = 'REDACTED_EXPIRED_TEST_TOKEN';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 5001, path: '/api/v1' + path, headers: { 'Authorization': 'Bearer ' + MGR_TOKEN } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, raw: b }); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const ws = await get('/workspace');
  console.log('Workspace status:', ws.status);
  console.log('Workspace data:', JSON.stringify(ws.data, null, 2).substring(0, 500));
}
main().catch(console.error);
