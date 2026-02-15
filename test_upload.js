const https = require('https');
const fs = require('fs');
const FormData = require('form-data');

// Get presigned URL
const postData = JSON.stringify({ fileType: 'image/jpeg' });

const options = {
  hostname: 'ofu8qmpqt9.execute-api.ap-south-1.amazonaws.com',
  path: '/dev/get-upload-url',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': postData.length
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('Upload URL:', result.uploadUrl);
    console.log('Key:', result.fields.key);
    
    // Create test file
    fs.writeFileSync('test.jpg', Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]));
    
    // Upload to S3
    const form = new FormData();
    Object.entries(result.fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', fs.createReadStream('test.jpg'));
    
    form.submit(result.uploadUrl, (err, res) => {
      if (err) {
        console.error('Upload error:', err.message);
        return;
      }
      console.log('Upload status:', res.statusCode);
      res.on('data', (d) => console.log(d.toString()));
    });
  });
});

req.write(postData);
req.end();
