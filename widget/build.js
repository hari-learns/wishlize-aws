/**
 * Wishlize Widget Build Script
 * 
 * Builds a minified version of the widget for CDN deployment
 */

const fs = require('fs');
const path = require('path');

// Read source files
const widgetSrc = fs.readFileSync(path.join(__dirname, 'src', 'widget.js'), 'utf8');

// Simple minification (remove comments, extra whitespace)
function minify(code) {
  return code
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove extra whitespace
    .replace(/\n\s*\n/g, '\n')
    // Remove leading/trailing whitespace
    .trim();
}

const minified = minify(widgetSrc);

// Ensure build directory exists
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Write minified version
fs.writeFileSync(path.join(buildDir, 'wishlize-widget.min.js'), minified);

// Write unminified version for debugging
fs.writeFileSync(path.join(buildDir, 'wishlize-widget.js'), widgetSrc);

console.log('✅ Widget built successfully!');
console.log(`   - build/wishlize-widget.js (${(widgetSrc.length / 1024).toFixed(2)} KB)`);
console.log(`   - build/wishlize-widget.min.js (${(minified.length / 1024).toFixed(2)} KB)`);
