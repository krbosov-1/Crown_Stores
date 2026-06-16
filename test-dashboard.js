const http = require('http');
http.get('http://localhost:3000/dashboard/director', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, '\nBody:', data.slice(0, 1000)));
}).on('error', err => console.log('Error:', err.message));
