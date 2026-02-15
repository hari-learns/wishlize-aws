import requests
import json

# Get presigned URL
resp = requests.post(
    'https://ofu8qmpqt9.execute-api.ap-south-1.amazonaws.com/dev/get-upload-url',
    json={'fileType': 'image/jpeg'}
)
data = resp.json()
print(f"Upload URL: {data['uploadUrl']}")
print(f"Key: {data['fields'].get('key', 'MISSING')}")

# Create test file
with open('test.jpg', 'wb') as f:
    f.write(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01')

# Upload
files = {'file': open('test.jpg', 'rb')}
form = data['fields']

upload_resp = requests.post(data['uploadUrl'], data=form, files=files)
print(f"Upload status: {upload_resp.status_code}")
print(f"Response: {upload_resp.text[:500]}")
