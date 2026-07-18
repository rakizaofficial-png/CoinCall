import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'CoinCall Beauty',
  slug: 'coincall-beauty',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'coincall',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.coincall.host',
    infoPlist: {
      NSCameraUsageDescription:
        'CoinCall Beauty needs camera for host intro video and live calls.',
      NSMicrophoneUsageDescription:
        'CoinCall Beauty needs microphone for intro video and live calls.',
      NSPhotoLibraryUsageDescription:
        'CoinCall Beauty needs photo library for host profile picture and intro video.',
    },
  },
  android: {
    package: 'com.coincall.host',
    adaptiveIcon: {
      backgroundColor: '#1A0F16',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'CAMERA',
      'RECORD_AUDIO',
      'INTERNET',
      'POST_NOTIFICATIONS',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'expo-image-picker',
      {
        photosPermission:
          'CoinCall Beauty needs photo access for your host profile picture.',
        cameraPermission:
          'CoinCall Beauty needs camera for your host intro and calls.',
        microphonePermission:
          'CoinCall Beauty needs microphone for intro video and calls.',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
    },
  },
};

export default config;
