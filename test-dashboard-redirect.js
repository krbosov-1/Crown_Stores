const http = require('http');
const querystring = require('querystring');

const postData = querystring.stringify({
  username: 'director',
  password: 'password'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const cookie = res.headers['set-cookie'];
    
    // Fetch /dashboard
    http.get({
      hostname: 'localhost',
      port: 3000,
      path: '/dashboard',
      headers: { 'Cookie': cookie[0] }
    }, (res2) => {
      console.log('/dashboard status:', res2.statusCode);
      console.log('/dashboard headers location:', res2.headers.location);
    });
  });
});

req.on('error', err => console.log('Error:', err.message));
req.write(postData);
req.end();
