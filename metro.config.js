// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a WebAssembly build (wa-sqlite.wasm). Metro must
// treat `.wasm` as a static asset so the worker's `import '...wa-sqlite.wasm'`
// resolves. Without this the web bundle fails to compile.
config.resolver.assetExts.push('wasm');

// wa-sqlite's OPFS / AccessHandlePool VFS relies on SharedArrayBuffer, which
// requires the page to be cross-origin isolated. Serve the dev bundle with the
// COOP/COEP headers so SQLite can initialize in the browser. (Harmless on
// native, where this middleware is not exercised.)
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return middleware(req, res, next);
  };
};

module.exports = config;
