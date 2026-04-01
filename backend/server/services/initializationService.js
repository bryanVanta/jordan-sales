/**
 * Initialization Service
 * Loads product & services information from Firebase on server startup
 * and maintains an in-memory cache for quick access.
 */

const { getCurrentProductInfo } = require('./productInfoService');

let productInfoCache = null;
let isInitialized = false;
let initializationPromise = null;

/**
 * Initialize the system by loading product info from Firebase
 * Called once on server startup
 * Non-blocking: logs warnings but doesn't crash if Firebase is unavailable
 */
async function initializeSystem() {
  if (isInitialized) {
    return productInfoCache;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log('📚 Loading product & services information from Firebase...');
      productInfoCache = await getCurrentProductInfo();

      if (productInfoCache) {
        console.log(`✅ Product info loaded: "${productInfoCache.productName || 'Unnamed Product'}"`);
      } else {
        console.log('⚠️  No product & services information found in Firebase. Will fetch on-demand via API.');
      }

      isInitialized = true;
      return productInfoCache;
    } catch (error) {
      console.warn('⚠️  Could not load product info from Firebase:', error.message);
      console.log('ℹ️  Server will continue running. Provide product info via API when ready.');
      isInitialized = true;
      return null;
    }
  })();

  return initializationPromise;
}

/**
 * Get cached product info (returns null if not initialized)
 */
function getProductInfoCache() {
  return productInfoCache;
}

/**
 * Refresh product info from Firebase (useful if data changes outside the app)
 */
async function refreshProductInfo() {
  try {
    console.log('🔄 Refreshing product & services information from Firebase...');
    productInfoCache = await getCurrentProductInfo();
    console.log('✅ Product info refreshed');
    return productInfoCache;
  } catch (error) {
    console.error('❌ Failed to refresh product info:', error.message);
    throw error;
  }
}

/**
 * Check if system is initialized
 */
function isSystemInitialized() {
  return isInitialized;
}

module.exports = {
  initializeSystem,
  getProductInfoCache,
  refreshProductInfo,
  isSystemInitialized,
};
