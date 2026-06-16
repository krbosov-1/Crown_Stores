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
    console.log('Login Status:', res.statusCode);
    const cookie = res.headers['set-cookie'];
    console.log('Cookie:', cookie);
    if (!cookie) return;
    
    // Fetch dashboard
    http.get({
      hostname: 'localhost',
      port: 3000,
      path: '/dashboard/director',
      headers: { 'Cookie': cookie[0] }
    }, (res2) => {
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        console.log('Dashboard Status:', res2.statusCode);
        console.log('Dashboard Body:', data2.slice(0, 500));
        if (res2.statusCode === 500) {
            console.log('Error 500 Full Body:', data2);
        }
      });
    });
  });
});

req.on('error', err => console.log('Error:', err.message));
req.write(postData);
req.end();
