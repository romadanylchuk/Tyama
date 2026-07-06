/**
 * Jest manual mock for expo-file-system.
 *
 * Used by backup-repository.ts for writing and reading backup files.
 * In the test environment we simulate the file system with an in-memory Map
 * so we can verify that files are written/read without touching the real FS.
 *
 * API surface implemented (only what backup-repository.ts uses):
 *   FileSystem.documentDirectory   — returns a fake directory URI string
 *   FileSystem.writeAsStringAsync  — stores content in the in-memory store
 *   FileSystem.readAsStringAsync   — retrieves content from the in-memory store
 *   FileSystem.deleteAsync         — removes a file from the in-memory store
 *   FileSystem.getInfoAsync        — returns { exists: true/false }
 *
 * NOT implemented (not used by backup-repository):
 *   copyAsync, moveAsync, downloadAsync, etc.
 */

'use strict';

// In-memory file store: uri → content string
const _store = new Map();

/** Reset the store between tests. */
function _reset() {
  _store.clear();
}

/** Read the raw store (for test assertions). */
function _getStore() {
  return new Map(_store);
}

const documentDirectory = 'file:///test-app-storage/';

async function writeAsStringAsync(uri, content /*, options */) {
  _store.set(uri, content);
}

async function readAsStringAsync(uri /*, options */) {
  if (!_store.has(uri)) {
    throw new Error(`expo-file-system mock: file not found: ${uri}`);
  }
  return _store.get(uri);
}

async function deleteAsync(uri /*, options */) {
  _store.delete(uri);
}

async function getInfoAsync(uri /*, options */) {
  return { exists: _store.has(uri), isDirectory: false, size: 0, modificationTime: 0, uri };
}

module.exports = {
  documentDirectory,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
  getInfoAsync,
  // Test utilities
  _reset,
  _getStore,
};
