import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DeepAR, { CameraPositions, type IDeepARHandle } from 'react-native-deepar';
import {
  getDeepARLicenseKey,
  registerDeepARView,
} from '../../services/deepArNativeService';

/** Native full-bleed host camera for Go Live */
export function LiveBroadcastSurface({ cameraOff }: { cameraOff: boolean }) {
  const deepARRef = useRef<IDeepARHandle>(null);
  const licenseKey = getDeepARLicenseKey();

  if (cameraOff) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05070F' }]} />
    );
  }
  if (!licenseKey) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.missing]}>
        <Text style={styles.missingTitle}>DeepAR license missing</Text>
        <Text style={styles.missingText}>
          Set EXPO_PUBLIC_DEEPAR_ANDROID_LICENSE_KEY before starting host live.
        </Text>
      </View>
    );
  }
  return (
    <DeepAR
      ref={(node) => {
        deepARRef.current = node;
        registerDeepARView(node);
      }}
      style={StyleSheet.absoluteFill}
      apiKey={licenseKey}
      position={CameraPositions.FRONT}
      videoWarmup
      onInitialized={() => registerDeepARView(deepARRef.current)}
      onError={(message) => console.warn('[deepar-native]', message)}
    />
  );
}

const styles = StyleSheet.create({
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05070F',
    padding: 24,
  },
  missingTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  missingText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
