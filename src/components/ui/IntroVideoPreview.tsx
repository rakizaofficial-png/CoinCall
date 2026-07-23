import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
  loop?: boolean;
};

/** Lightweight intro/preview player (replaces deprecated expo-av Video). */
export function IntroVideoPreview({
  uri,
  style,
  contentFit = 'contain',
  loop = true,
}: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.pause();
  });

  return (
    <VideoView
      player={player}
      style={[styles.video, style]}
      contentFit={contentFit}
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

const styles = StyleSheet.create({
  video: { width: '100%', backgroundColor: '#000' },
});
