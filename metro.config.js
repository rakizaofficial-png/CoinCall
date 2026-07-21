const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Avoid Firebase Auth Hermes crashes with wrong package-exports resolution.
// See: Expo + Firebase JS SDK auth persistence guidance.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
