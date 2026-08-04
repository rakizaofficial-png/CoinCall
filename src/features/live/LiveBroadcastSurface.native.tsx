import { Platform, StyleSheet, View } from 'react-native';
import {
  RenderModeType,
  RtcSurfaceView,
  RtcTextureView,
  VideoMirrorModeType,
  VideoSourceType,
} from 'react-native-agora';

/**
 * Native full-bleed host camera for Go Live.
 *
 * Agora must be the only owner of the physical camera while broadcasting.
 * Mounting a second native camera here previously conflicted with Agora's
 * preview and caused crashes on physical Android devices.
 */
export function LiveBroadcastSurface({ cameraOff }: { cameraOff: boolean }) {
  if (cameraOff) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05070F' }]} />
    );
  }

  const AgoraVideoView =
    Platform.OS === 'android' ? RtcTextureView : RtcSurfaceView;

  return (
    <AgoraVideoView
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
