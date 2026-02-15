// Widget configuration constants
// Update API_BASE after deployment with actual API Gateway URL

const CONFIG = {
  // API Gateway base URL (update after deployment)
  // Replace with your actual API Gateway URL after running 'npm run deploy'
  API_BASE: 'https://your-api-id.execute-api.ap-south-1.amazonaws.com/dev',
  
  // S3 bucket for photo uploads
  // Must match the bucket name configured in serverless.yml
  S3_UPLOAD_BUCKET: 'wishlize-uploads',
  
  // Maximum retry attempts for API calls
  // Number of times to retry failed API requests before giving up
  MAX_RETRIES: 3,
  
  // Request timeout in milliseconds
  // Maximum time to wait for API responses (30 seconds)
  REQUEST_TIMEOUT: 30000,
  
  // Supported image formats for photo uploads
  // MIME types that the widget will accept for try-on photos
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
  
  // Maximum file size for photo uploads
  // 10MB limit to prevent large file uploads that could cause timeouts
  MAX_FILE_SIZE: 10 * 1024 * 1024
};

export default CONFIG;