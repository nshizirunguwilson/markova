import type { ExpoConfig } from 'expo/config';

/**
 * Expo config as code, so the API URL and EAS project id can come from the
 * environment instead of being frozen into app.json.
 *
 * This previously lived in app.json with no `extra` block at all, which meant
 * `API_URL` always fell back to `http://localhost:3000/api` — unreachable from
 * any physical device — and `getExpoPushTokenAsync` had no project id, so a
 * standalone build could never register for push.
 *
 * Set these in `.env` locally (see .env.example) and as EAS secrets for builds:
 *   EXPO_PUBLIC_API_URL     https://api.yourschool.example/api
 *   EXPO_PUBLIC_WS_URL      https://api.yourschool.example
 *   EAS_PROJECT_ID          the UUID from `eas init`
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ?? API_URL.replace(/\/api\/?$/, '');

const BRAND_NAVY = '#1B4F72';

const config: ExpoConfig = {
  name: 'Markova',
  slug: 'markova',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'markova',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: BRAND_NAVY,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.markova.app',
    infoPlist: {
      // Uploading a profile photo from the library.
      NSPhotoLibraryUsageDescription:
        'Markova needs access to your photos so you can set a profile picture.',
      NSCameraUsageDescription:
        'Markova needs access to your camera so you can take a profile picture.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: BRAND_NAVY,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'com.markova.app',
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    [
      'expo-notifications',
      {
        // White silhouette on transparent — Android tints it in the status bar.
        icon: './assets/notification-icon.png',
        color: BRAND_NAVY,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Markova needs access to your photos so you can set a profile picture.',
        cameraPermission:
          'Markova needs access to your camera so you can take a profile picture.',
      },
    ],
  ],
  extra: {
    apiUrl: API_URL,
    wsUrl: WS_URL,
    eas: {
      // Populated by `eas init`; required for push tokens in a standalone build.
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
};

export default config;
