const http = require('http');
const querystring = require('querystring');

['manager1', 'agent1'].forEach(user => {
    const postData = querystring.stringify({
      username: user,
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
        const dashPath = user === 'manager1' ? '/dashboard/manager' : '/dashboard/agent';
        // Fetch dashboard
        http.get({
          hostname: 'localhost',
          port: 3000,
          path: dashPath,
          headers: { 'Cookie': cookie[0] }
        }, (res2) => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => {
            if (data2.includes('Error loading dashboard data')) {
                console.log(user, 'FLASH ERROR FOUND!');
            } else {
                console.log(user, 'Dashboard rendered correctly, Status:', res2.statusCode);
            }
          });
        });
      });
    });

    req.on('error', err => console.log('Error:', err.message));
    req.write(postData);
    req.end();
});
