# Host Android APK Size Analysis & Optimization

## Before
| Artifact | Size |
|---|---|
| Debug universal APK | **~498 MB** |

### Root causes
1. **4 ABIs packaged** (`arm64-v8a` + `armeabi-v7a` + `x86` + `x86_64`) → **467 MB** native libs alone  
2. **Agora full SDK extensions** unused (lip-sync, spatial audio, clear-vision, face capture, AV1, screen capture, ML barcode `barhopper`, …) → **~40 MB/ABI**  
3. **Debug build** (no R8, no resource shrink, uncompressed `.so` via `useLegacyPackaging=false`)  
4. App JS/assets were tiny (~1 MB); images/fonts were **not** the problem

## After (Release)
| Artifact | Size |
|---|---|
| **Release APK** (`arm64-v8a`) | **39.7 MB** ✅ under 80 MB |
| **Release AAB** | **47.2 MB** |

Package: `com.coincall.host` · versionName `1.0.1` · versionCode `2`

## What we changed
- ABI filter → **arm64-v8a only** (Play AAB still delivers the right ABI)
- Enabled **R8 minify** + **resource shrinking** + **PNG crunch**
- `expo.useLegacyPackaging=true` → compress native `.so` inside APK
- Strip unused Agora extensions + ML Kit barcode (`barhopper`)
- Disable unused camera barcode scanner
- Compress launcher icons
- Expo config plugin `plugins/withAndroidSizeOptimizations.js` so prebuild keeps these settings

## Functionality preserved
- Agora video/audio calling (`libagora-rtc-sdk` + ffmpeg + beauty via core `setBeautyEffectOptions`)
- Expo Host features (auth, live, chat, wallet, etc.)
- Hermes + Reanimated + Worklets

## Rebuild locally
```bash
cd android
./gradlew :app:assembleRelease :app:bundleRelease
# outputs:
#   app/build/outputs/apk/release/app-release.apk
#   app/build/outputs/bundle/release/app-release.aab
```
