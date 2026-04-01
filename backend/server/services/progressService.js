/**
 * Progress Service
 * Tracks search progress for real-time UI updates (no circular dependencies)
 */

// Global progress store - tracks progress by productInfoId
const progressStore = new Map();

const updateProgress = (productInfoId, status, details = {}) => {
  const key = productInfoId || 'current';
  progressStore.set(key, {
    status,
    timestamp: new Date().toISOString(),
    ...details
  });
  console.log(`[Progress] ${status} - ${details.message || ''}`);
};

const getProgress = (productInfoId) => {
  const key = productInfoId || 'current';
  return progressStore.get(key) || { status: 'idle', message: 'No active search' };
};

module.exports = {
  updateProgress,
  getProgress,
};
