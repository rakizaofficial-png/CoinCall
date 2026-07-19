import { useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  onSurfacesReady: () => void;
  localStyle?: StyleProp<ViewStyle>;
  remoteStyle?: StyleProp<ViewStyle>;
};

/**
 * Default (web) Agora video surfaces. Native override: AgoraCallSurfaces.native.tsx
 */
export function AgoraCallSurfaces({
  onSurfacesReady,
  localStyle,
  remoteStyle,
}: Props) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const remoteRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);

  const maybeReady = () => {
    if (readyRef.current) return;
    if (localRef.current && remoteRef.current) {
      readyRef.current = true;
      onSurfacesReady();
    }
  };

  return (
    <>
      <div
        ref={(el: HTMLDivElement | null) => {
          remoteRef.current = el;
          maybeReady();
        }}
        id="agora-remote"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: '#000',
          ...(remoteStyle as object),
        }}
      />
      <View style={[styles.localPreview, localStyle]} pointerEvents="none">
        <div
          ref={(el: HTMLDivElement | null) => {
            localRef.current = el;
            maybeReady();
          }}
          id="agora-local"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 20,
            overflow: 'hidden',
            background: '#111',
          }}
        />
      </View>
    </>
  );
}

export function getWebVideoElements(): {
  local: HTMLElement | null;
  remote: HTMLElement | null;
} {
  if (typeof document === 'undefined') {
    return { local: null, remote: null };
  }
  return {
    local: document.getElementById('agora-local'),
    remote: document.getElementById('agora-remote'),
  };
}

const styles = StyleSheet.create({
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
