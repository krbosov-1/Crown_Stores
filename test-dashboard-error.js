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
        if (data2.includes('Error loading dashboard data')) {
            console.log('FLASH ERROR FOUND!');
            // now check the log file
            console.log('We should check server logs to see the actual error');
        } else {
            console.log('No Flash Error in Dashboard.');
        }
      });
    });
  });
});

req.on('error', err => console.log('Error:', err.message));
req.write(postData);
req.end();
