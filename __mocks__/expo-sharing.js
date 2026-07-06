/**
 * Jest manual mock for expo-sharing.
 *
 * Used by backup-repository.ts to open the system share sheet after writing
 * a backup file. In tests we just record the call and do nothing.
 *
 * API surface implemented:
 *   Sharing.isAvailableAsync   — always returns true in tests
 *   Sharing.shareAsync         — records the last call; no-op
 */

'use strict';

let _lastSharedUri = null;
let _shareCallCount = 0;

function _reset() {
  _lastSharedUri = null;
  _shareCallCount = 0;
}

function _getLastSharedUri() {
  return _lastSharedUri;
}

function _getShareCallCount() {
  return _shareCallCount;
}

async function isAvailableAsync() {
  return true;
}

async function shareAsync(uri /*, options */) {
  _lastSharedUri = uri;
  _shareCallCount += 1;
}

module.exports = {
  isAvailableAsync,
  shareAsync,
  // Test utilities
  _reset,
  _getLastSharedUri,
  _getShareCallCount,
};
