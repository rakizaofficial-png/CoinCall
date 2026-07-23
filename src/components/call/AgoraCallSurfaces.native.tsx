import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  RenderModeType,
  RtcSurfaceView,
  VideoMirrorModeType,
  VideoSourceType,
} from 'react-native-agora';
import {
  getNativeRemoteUid,
  subscribeNativeRemoteUid,
} from '../../services/agoraService';

type Props = {
  onSurfacesReady: () => void;
  localStyle?: StyleProp<ViewStyle>;
  remoteStyle?: StyleProp<ViewStyle>;
};

/**
 * Native Agora video surfaces (RtcSurfaceView) for iOS / Android store builds.
 */
export function AgoraCallSurfaces({
  onSurfacesReady,
  localStyle,
  remoteStyle,
}: Props) {
  const [remoteUid, setRemoteUid] = useState<number | null>(getNativeRemoteUid());

  useEffect(() => {
    onSurfacesReady();
  }, [onSurfacesReady]);

  useEffect(() => subscribeNativeRemoteUid(setRemoteUid), []);

  return (
    <>
      <View style={[styles.remoteFill, remoteStyle]}>
        {remoteUid != null && remoteUid > 0 ? (
          <RtcSurfaceView
            style={StyleSheet.absoluteFill}
            canvas={{
              uid: remoteUid,
              sourceType: VideoSourceType.VideoSourceRemote,
              renderMode: RenderModeType.RenderModeHidden,
            }}
            zOrderMediaOverlay={false}
          />
        ) : null}
      </View>
      <View style={[styles.localPreview, localStyle]} pointerEvents="none">
        <RtcSurfaceView
          style={StyleSheet.absoluteFill}
          canvas={{
            uid: 0,
            sourceType: VideoSourceType.VideoSourceCameraPrimary,
            renderMode: RenderModeType.RenderModeHidden,
            mirrorMode: VideoMirrorModeType.VideoMirrorModeEnabled,
          }}
          zOrderMediaOverlay
        />
      </View>
    </>
  );
}

export function getWebVideoElements(): {
  local: HTMLElement | null;
  remote: HTMLElement | null;
} {
  return { local: null, remote: null };
}

const styles = StyleSheet.create({
  remoteFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000',
  },
  localPreview: {
    position: 'absolute',
    top: 100,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    zIndex: 5,
  },
});
