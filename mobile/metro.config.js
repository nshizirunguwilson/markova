// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/*
  Keep the tests out of the app.

  Every screen's tests sit beside it in app/, and Expo Router turns every
  .tsx file under app/ into a route. Without this the bundle pulls each
  *.spec.tsx in as a screen, drags @testing-library/react-native in with it,
  and the app fails to start on a device with "Unable to resolve module
  console". Jest finds the specs on its own and never goes through Metro.
*/
const specs = /\.spec\.[jt]sx?$/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing
  ? [...(Array.isArray(existing) ? existing : [existing]), specs]
  : [specs];

module.exports = config;
