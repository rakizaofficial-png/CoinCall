import type { ExpoConfig, ConfigContext } from 'expo/config';

const IS_PROD =
  process.env.EXPO_PUBLIC_APP_ENV === 'production' ||
  process.env.EAS_BUILD_PROFILE === 'production' ||
  process.env.NODE_ENV === 'production';

/**
 * CoinCall Host — Expo config for web + native (EAS AAB / IPA).
 * Native video uses react-native-agora (requires Dev Client / EAS build, not Expo Go).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'CoinCall Beauty',
  slug: 'coin-call',
  owner: 'salman112211',
  version: '1.0.4',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'coincall',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.coincall.host',
    buildNumber: process.env.EAS_BUILD_NUMBER || '1',
    infoPlist: {
      NSCameraUsageDescription:
        'CoinCall Beauty needs camera for host intro video and live calls.',
      NSMicrophoneUsageDescription:
        'CoinCall Beauty needs microphone for intro video and live calls.',
      NSPhotoLibraryUsageDescription:
        'CoinCall Beauty needs photo library for host profile picture and intro video.',
      UIBackgroundModes: ['audio'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.coincall.host',
    versionCode: Number(process.env.ANDROID_VERSION_CODE || 5),
    softwareKeyboardLayoutMode: 'resize',
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
      'ACCESS_NETWORK_STATE',
      'MODIFY_AUDIO_SETTINGS',
      'BLUETOOTH',
      'BLUETOOTH_CONNECT',
      'WAKE_LOCK',
      'POST_NOTIFICATIONS',
      'READ_MEDIA_IMAGES',
      'READ_MEDIA_VIDEO',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-dev-client',
    'expo-font',
    'expo-video',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#F5C14C',
        sounds: [],
      },
    ],
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
    [
      'expo-camera',
      {
        cameraPermission:
          'CoinCall Beauty needs camera for host intro and calls.',
        microphonePermission:
          'CoinCall Beauty needs microphone for intro video and calls.',
        recordAudioAndroid: true,
        // Barcode scanner unused — avoid ML Kit barhopper (~5MB/ABI)
        barcodeScannerEnabled: false,
      },
    ],
    // Size: ABI filter, R8, shrink resources, strip Agora extensions
    './plugins/withAndroidSizeOptimizations',
    // Last: force Android SDK for androidx.core 1.16+ (needs compileSdk ≥ 35)
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 36,
          targetSdkVersion: 35,
          buildToolsVersion: '36.0.0',
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          enablePngCrunchInReleaseBuilds: true,
          // Compress .so inside APK (ABI filter via withAndroidSizeOptimizations)
          useLegacyPackaging: true,
          extraProguardRules:
            '-keep class io.agora.** { *; }\n-keep class com.facebook.react.** { *; }\n-dontwarn io.agora.**',
        },
        ios: {
          deploymentTarget: '16.4',
        },
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '28dee9ee-23a0-4a69-948b-c153c5aa11c1',
    },
    appEnv: IS_PROD ? 'production' : 'development',
  },
});
