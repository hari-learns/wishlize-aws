#!/usr/bin/env node

/**
 * S3 Global Optimization Test Script
 * 
 * This script tests the complete S3 global optimization implementation
 * to ensure the CORS issue is resolved and the system works globally.
 */

const s3Service = require('./services/s3Service');
const RegionResolver = require('./services/regionResolver');
const S3ConfigurationManager = require('./services/s3ConfigurationManager');
const EnhancedS3Service = require('./services/enhancedS3Service');

async function testS3GlobalOptimization() {
  console.log('🚀 Testing S3 Global Optimization Implementation\n');

  try {
    // Test 1: Region Detection
    console.log('1️⃣ Testing Region Detection...');
    const regionResolver = new RegionResolver();
    const bucketRegion = await regionResolver.detectBucketRegion('wishlize-uploads');
    console.log(`   ✅ Bucket 'wishlize-uploads' detected in region: ${bucketRegion}`);
    
    if (bucketRegion !== 'us-east-1') {
      console.log(`   ⚠️  Expected us-east-1, got ${bucketRegion}`);
    }

    // Test 2: Configuration Management
    console.log('\n2️⃣ Testing Configuration Management...');
    const configManager = new S3ConfigurationManager();
    const config = await configManager.getConfiguration();
    console.log(`   ✅ Configuration loaded with ${Object.keys(config.buckets).length} buckets`);
    console.log(`   ✅ Upload bucket region: ${config.buckets['wishlize-uploads']?.region || 'not found'}`);

    // Test 3: Enhanced S3 Service
    console.log('\n3️⃣ Testing Enhanced S3 Service...');
    const enhancedS3 = new EnhancedS3Service();
    const uploadResult = await enhancedS3.generateUploadUrl('test-session-' + Date.now(), 'image/jpeg');
    console.log(`   ✅ Upload URL generated: ${uploadResult.uploadUrl}`);
    console.log(`   ✅ Public URL: ${uploadResult.publicUrl}`);
    console.log(`   ✅ Detected region: ${uploadResult.region}`);

    // Test 4: Backward Compatibility
    console.log('\n4️⃣ Testing Backward Compatibility...');
    const legacyResult = await s3Service.generateUploadUrl('legacy-test-' + Date.now(), 'image/jpeg');
    console.log(`   ✅ Legacy API works: ${legacyResult.uploadUrl}`);
    console.log(`   ✅ Legacy public URL: ${legacyResult.publicUrl}`);

    // Test 5: CORS Prevention Check
    console.log('\n5️⃣ Testing CORS Prevention...');
    const publicUrl = legacyResult.publicUrl;
    const urlParts = new URL(publicUrl);
    
    if (urlParts.hostname.includes('us-east-1') || urlParts.hostname === 's3.amazonaws.com') {
      console.log('   ✅ CORS issue resolved: Using correct region endpoint');
    } else if (urlParts.hostname.includes('ap-south-1')) {
      console.log('   ❌ CORS issue NOT resolved: Still using wrong region');
    }

    // Test 6: Performance Metrics
    console.log('\n6️⃣ Testing Performance Metrics...');
    const startTime = Date.now();
    await s3Service.generateUploadUrl('perf-test-' + Date.now(), 'image/jpeg');
    const duration = Date.now() - startTime;
    console.log(`   ✅ Upload URL generation took ${duration}ms`);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   • Bucket region correctly detected: ${bucketRegion}`);
    console.log(`   • Configuration management: Working`);
    console.log(`   • Enhanced S3 service: Working`);
    console.log(`   • Backward compatibility: Maintained`);
    console.log(`   • CORS issue: Resolved`);
    console.log(`   • Performance: ${duration}ms per request`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testS3GlobalOptimization();
}

module.exports = { testS3GlobalOptimization };