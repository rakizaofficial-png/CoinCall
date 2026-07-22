/**
 * Expo config plugin — shrink Host Android release APK/AAB.
 * - arm64-v8a (+ optional armeabi-v7a for AAB splits via RN arches)
 * - R8 minify + resource shrinking
 * - Strip unused Agora extensions / ML Kit barcode native libs
 * - Compress native libs in APK (legacy packaging)
 */
const {
  withGradleProperties,
  withAppBuildGradle,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const AGORA_EXCLUDES = [
  '**/libagora_lip_sync_extension.so',
  '**/libagora_clear_vision_extension.so',
  '**/libagora_spatial_audio_extension.so',
  '**/libagora_face_capture_extension.so',
  '**/libagora_face_detection_extension.so',
  '**/libagora_content_inspect_extension.so',
  '**/libagora_video_quality_analyzer_extension.so',
  '**/libagora_segmentation_extension.so',
  '**/libagora_ai_noise_suppression_ll_extension.so',
  '**/libagora_ai_echo_cancellation_ll_extension.so',
  '**/libagora_screen_capture_extension.so',
  '**/libagora_video_av1_encoder_extension.so',
  '**/libagora_audio_beauty_extension.so',
  '**/libagora_ai_noise_suppression_extension.so',
  '**/libagora_ai_echo_cancellation_extension.so',
  '**/libbarhopper_v3.so',
  '**/libbarhopper_v2.so',
];

function setGradleProp(props, key, value) {
  const i = props.findIndex((p) => p.type === 'property' && p.key === key);
  if (i >= 0) props[i].value = value;
  else props.push({ type: 'property', key, value });
}

function withAndroidSizeOptimizations(config) {
  config = withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    // Phones: arm64 only for universal APK size. AAB still splits per-device.
    setGradleProp(props, 'reactNativeArchitectures', 'arm64-v8a');
    setGradleProp(props, 'android.enableMinifyInReleaseBuilds', 'true');
    setGradleProp(props, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    setGradleProp(props, 'android.enablePngCrunchInReleaseBuilds', 'true');
    // Compress .so inside APK (critical size win vs storeUncompressed)
    setGradleProp(props, 'expo.useLegacyPackaging', 'true');
    setGradleProp(
      props,
      'android.packagingOptions.excludes',
      AGORA_EXCLUDES.join(','),
    );
    // Dev network inspector not needed in release packaging path
    setGradleProp(props, 'EX_DEV_CLIENT_NETWORK_INSPECTOR', 'false');
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('ndk {')) {
      contents = contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {
        ndk {
            abiFilters "arm64-v8a"
        }`,
      );
    }
    // Ensure packaging excludes jniLibs for leftover extensions
    if (!contents.includes('libagora_lip_sync_extension')) {
      contents = contents.replace(
        /packagingOptions\s*\{[\s\S]*?jniLibs\s*\{[\s\S]*?\}/,
        (block) => {
          if (block.includes('excludes')) return block;
          return block.replace(
            /jniLibs\s*\{/,
            `jniLibs {
            excludes += [
              ${AGORA_EXCLUDES.map((e) => `"${e}"`).join(',\n              ')}
            ]`,
          );
        },
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withAndroidSizeOptimizations,
  'withAndroidSizeOptimizations',
  '1.0.0',
);
