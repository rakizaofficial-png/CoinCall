import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Luma',
  slug: 'luma',
  version: '1.0.0',
  orientation: 'portrait',
  icon: '../assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'luma',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.coincall.luma',
    infoPlist: {
      NSCameraUsageDescription: 'Luma needs camera access for video calls.',
      NSMicrophoneUsageDescription: 'Luma needs microphone access for video calls.',
    },
  },
  android: {
    package: 'com.coincall.luma',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#1A0F16',
      foregroundImage: '../assets/android-icon-foreground.png',
      backgroundImage: '../assets/android-icon-background.png',
      monochromeImage: '../assets/android-icon-monochrome.png',
    },
    permissions: [
      'INTERNET',
      'CAMERA',
      'RECORD_AUDIO',
      'MODIFY_AUDIO_SETTINGS',
      'POST_NOTIFICATIONS',
    ],
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
};

export default config;
