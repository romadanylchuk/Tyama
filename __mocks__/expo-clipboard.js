/**
 * Jest manual mock for expo-clipboard.
 *
 * Used by ClipboardPromptProvider.ts to copy the explanation prompt to the
 * learner's clipboard. In tests we record calls and do nothing with the OS.
 *
 * API surface implemented (only what ClipboardPromptProvider uses):
 *   Clipboard.setStringAsync    — records the last copied string; resolves void
 *   Clipboard.isAvailableAsync  — returns true by default (overridable per test)
 *
 * Pattern mirrors __mocks__/expo-sharing.js: module-level counters prefixed
 * with 'mock' + test utilities (_reset, _getLastCopied, etc.) for assertions.
 */

'use strict';

let _lastCopied = null;
let _copyCallCount = 0;
let _isAvailableResult = true;
let _setStringImpl = null; // null = default no-op success

function _reset() {
  _lastCopied = null;
  _copyCallCount = 0;
  _isAvailableResult = true;
  _setStringImpl = null;
}

function _getLastCopied() {
  return _lastCopied;
}

function _getCopyCallCount() {
  return _copyCallCount;
}

/**
 * Override the setStringAsync behaviour for a single test.
 * Pass null to restore the default (records + resolves void).
 * Pass a function that throws or rejects to simulate clipboard failure.
 */
function _setStringAsyncImpl(impl) {
  _setStringImpl = impl;
}

/**
 * Override the isAvailableAsync return value.
 */
function _setIsAvailable(value) {
  _isAvailableResult = value;
}

async function setStringAsync(str /*, options */) {
  _copyCallCount += 1;
  _lastCopied = str;
  if (_setStringImpl) {
    return _setStringImpl(str);
  }
  // Default: resolve void (success)
}

async function isAvailableAsync() {
  return _isAvailableResult;
}

module.exports = {
  setStringAsync,
  isAvailableAsync,
  // Test utilities
  _reset,
  _getLastCopied,
  _getCopyCallCount,
  _setStringAsyncImpl,
  _setIsAvailable,
};
