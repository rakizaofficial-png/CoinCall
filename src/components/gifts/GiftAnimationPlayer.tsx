import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { Audio } from 'expo-av';

export type GiftLottieSource =
  | string
  | { uri: string }
  | Record<string, unknown>
  | number;

export type GiftAnimationItem = {
  id: string;
  source: GiftLottieSource;
  title?: string;
  senderName?: string;
  giftName?: string;
  coins?: number;
  durationMs?: number;
  soundUrl?: string;
};

type Props = {
  item: GiftAnimationItem | null;
  onFinish: () => void;
};

function resolveLottieSource(source: GiftLottieSource) {
  if (typeof source === 'string') {
    return { uri: source };
  }
  return source;
}

export function GiftAnimationPlayer({ item, onFinish }: Props) {
  const lottieRef = useRef<LottieView>(null);
  const source = useMemo(
    () => (item ? resolveLottieSource(item.source) : null),
    [item],
  );

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    let sound: Audio.Sound | null = null;
    const timeout = setTimeout(onFinish, item.durationMs || 5200);
    const start = async () => {
      if (item.soundUrl) {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            interruptionModeIOS: 1,
            interruptionModeAndroid: 1,
            shouldDuckAndroid: true,
          });
          const loaded = await Audio.Sound.createAsync(
            { uri: item.soundUrl },
            { shouldPlay: false, volume: 0.78 },
          );
          sound = loaded.sound;
        } catch {
          sound = null;
        }
      }
      if (cancelled) {
        await sound?.unloadAsync().catch(() => undefined);
        return;
      }
      requestAnimationFrame(() => {
        lottieRef.current?.reset();
        lottieRef.current?.play();
        void sound?.playAsync();
      });
    };
    void start();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (sound) {
        void sound.stopAsync().catch(() => undefined);
        void sound.unloadAsync().catch(() => undefined);
      }
    };
  }, [item, onFinish]);

  if (!item || !source) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <LottieView
        ref={lottieRef}
        source={source as any}
        loop={false}
        autoPlay={false}
        resizeMode="cover"
        onAnimationFinish={onFinish}
        style={styles.lottie}
      />
      {(item.title || item.senderName || item.giftName) ? (
        <View style={styles.caption}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || 'Gift Sent'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[item.senderName, item.giftName, item.coins ? `${item.coins} coins` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  caption: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: '14%',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '700',
  },
});
