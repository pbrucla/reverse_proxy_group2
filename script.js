const http = require('http');

const hostname = 'cybrick.acmcyber.com';
const port = 8080;
const path = '/';

const makeRequest = () => {
  const options = {
    hostname: hostname,
    port: port,
    path: path,
    method: 'GET',
  };

  const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    
    res.on('data', (chunk) => {
      process.stdout.write(chunk);
    });

    res.on('end', () => {
      console.log('No more data in response.');
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.end();
};

for (let i = 0; i < 50; i++) {
  setTimeout(makeRequest, i); 
}

