const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.assetExts.push('wasm');

// pdf-lib / tslib ESM interop breaks on Metro web:
// "Cannot destructure property '__extends' of 'n.default' as it is undefined"
const tslibEs6 = require.resolve('tslib/tslib.es6.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return { type: 'sourceFile', filePath: tslibEs6 };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
