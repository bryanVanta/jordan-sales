/**
 * Progress Service
 * Tracks search progress for real-time UI updates (no circular dependencies)
 */

const progressStore = new Map();
const terminateStore = new Set();

const updateProgress = (productInfoId, status, details = {}) => {
  const key = productInfoId || 'current';
  const previous = progressStore.get(key) || {};
  // Preserve counters (progress/total/leadsFound) across partial updates within the same stage
  const preservedCounters = previous.status === status
    ? {
        progress: previous.progress,
        total: previous.total,
        leadsFound: previous.leadsFound,
      }
    : {};
  progressStore.set(key, {
    ...preservedCounters,
    status,
    timestamp: new Date().toISOString(),
    ...details,
  });
  console.log(`[Progress] ${status} - ${details.message || ''}`);
};

const getProgress = (productInfoId) => {
  const key = productInfoId || 'current';
  return progressStore.get(key) || { status: 'idle', message: 'No active search' };
};

const requestTerminate = (productInfoId) => {
  terminateStore.add(productInfoId || 'current');
  console.log(`[Progress] Terminate requested for: ${productInfoId || 'current'}`);
};

const isTerminateRequested = (productInfoId) => {
  return terminateStore.has(productInfoId || 'current');
};

const clearTerminate = (productInfoId) => {
  terminateStore.delete(productInfoId || 'current');
};

module.exports = {
  updateProgress,
  getProgress,
  requestTerminate,
  isTerminateRequested,
  clearTerminate,
};
