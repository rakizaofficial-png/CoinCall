import { StyleSheet, View } from 'react-native';
import {
  RenderModeType,
  RtcSurfaceView,
  VideoMirrorModeType,
  VideoSourceType,
} from 'react-native-agora';

/** Native full-bleed host camera for Go Live */
export function LiveBroadcastSurface({ cameraOff }: { cameraOff: boolean }) {
  if (cameraOff) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05070F' }]} />
    );
  }
  return (
    <RtcSurfaceView
      style={StyleSheet.absoluteFill}
      canvas={{
        uid: 0,
        sourceType: VideoSourceType.VideoSourceCameraPrimary,
        renderMode: RenderModeType.RenderModeHidden,
        mirrorMode: VideoMirrorModeType.VideoMirrorModeEnabled,
      }}
    />
  );
}
