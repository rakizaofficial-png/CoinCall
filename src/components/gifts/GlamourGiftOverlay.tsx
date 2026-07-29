import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, Vibration, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import {
  GIFT_RARITY_COLOR,
  GIFT_RARITY_LABEL,
  resolveGift,
  type GiftItem,
} from '../../data/gifts';

const LOCAL_GIFT_SOUNDS = {
  sparkle: require('../../../assets/gift-sounds/magic-sparkle.ogg'),
  rise: require('../../../assets/gift-sounds/magic-rise.ogg'),
  fireworks: require('../../../assets/gift-sounds/fireworks.ogg'),
} as const;

function localGiftSound(giftId: string) {
  if (['fireworks', 'sports_car', 'super_bike', 'private_jet', 'luxury_yacht', 'diamond_rain'].includes(giftId)) {
    return LOCAL_GIFT_SOUNDS.fireworks;
  }
  if (['diamond_crown', 'royal_castle', 'golden_throne', 'millionaire_box'].includes(giftId)) {
    return LOCAL_GIFT_SOUNDS.rise;
  }
  return LOCAL_GIFT_SOUNDS.sparkle;
}

export type GlamourGiftPayload = {
  id: string;
  giftId?: string;
  emoji: string;
  giftName: string;
  senderName: string;
  receiverName: string;
  coins: number;
  combo?: number;
};

type Props = {
  item: GlamourGiftPayload | null;
  onDone?: () => void;
};

function ParticleField({ gift }: { gift: GiftItem }) {
  const bits = useMemo(() => {
    const n = Math.min(18, 4 + gift.particles * 3);
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      left: `${(i * 19 + 7) % 92}%`,
      delay: (i % 6) * 80,
      size: 10 + (i % 4) * 5,
    }));
  }, [gift.particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bits.map((b) => (
        <RisingBit key={b.id} left={b.left} delay={b.delay} size={b.size} emoji={gift.emoji} />
      ))}
    </View>
  );
}

function RisingBit({
  left,
  delay,
  size,
  emoji,
}: {
  left: string;
  delay: number;
  size: number;
  emoji: string;
}) {
  const y = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => {
      opacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 1400 }),
      );
      y.value = withTiming(-420, {
        duration: 1800,
        easing: Easing.out(Easing.cubic),
      });
    }, delay);
    return () => clearTimeout(t);
  }, [delay, opacity, y]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[
        {
          position: 'absolute',
          bottom: '8%',
          left: left as `${number}%`,
          fontSize: size,
        },
        style,
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

/** Original fly-through for premium gifts. Vibration is the native sound-cue fallback. */
function GiftFlyThrough({ gift }: { gift: GiftItem }) {
  const x = useSharedValue(-420);
  const opacity = useSharedValue(0);

  useEffect(() => {
    Vibration.vibrate(gift.effect === 'spectacle' ? [0, 45, 80, 65] : 45);
    opacity.value = withSequence(
      withTiming(1, { duration: 180 }),
      withTiming(1, { duration: 1900 }),
      withTiming(0, { duration: 350 }),
    );
    x.value = withTiming(420, { duration: 2500, easing: Easing.inOut(Easing.cubic) });
  }, [gift.effect, opacity, x]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { rotate: '4deg' }],
  }));

  return (
    <View style={styles.flyZone} pointerEvents="none">
      <Animated.View style={[styles.flyTrail, style]} />
      <Animated.Text style={[styles.flyEmoji, style]}>{gift.emoji}</Animated.Text>
    </View>
  );
}

/**
 * Full-screen glamour gift for host live/call — Reanimated only (60fps-friendly).
 */
export function GlamourGiftOverlay({ item, onDone }: Props) {
  const gift = item
    ? resolveGift(item.giftId || '') ||
      ({
        id: 'custom',
        name: item.giftName,
        emoji: item.emoji,
        coins: item.coins,
        rarity: 'rare' as const,
        effect: 'cinematic' as const,
        tier: 'luxury' as const,
        animMs: 3600,
        particles: 3,
        gradient: ['#ff2a7a', '#c9184a'] as [string, string],
        glow: 'rgba(255,42,122,0.6)',
        category: 'vip' as const,
        animationUrl: '',
        soundUrl: 'https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg',
      } satisfies GiftItem)
    : null;

  useEffect(() => {
    if (!item || !gift) return;
    let cancelled = false;
    let sound: Audio.Sound | null = null;
    void Audio.Sound.createAsync(
      localGiftSound(gift.id),
      { shouldPlay: true, volume: 0.78 },
    )
      .then((loaded) => {
        if (cancelled) {
          void loaded.sound.unloadAsync();
        } else {
          sound = loaded.sound;
        }
      })
      .catch(() => undefined);
    const t = setTimeout(() => onDone?.(), gift.animMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (sound) {
        void sound.stopAsync().catch(() => undefined);
        void sound.unloadAsync().catch(() => undefined);
      }
    };
  }, [item, gift, onDone]);

  if (!item || !gift) return null;

  const rarityColor = GIFT_RARITY_COLOR[gift.rarity];
  const combo =
    item.combo && item.combo >= 2 ? `x${item.combo}` : null;
  const isBig = gift.effect === 'cinematic' || gift.effect === 'spectacle';

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(220)}
      style={styles.root}
      pointerEvents="none"
    >
      <View
        style={[
          styles.vignette,
          {
            backgroundColor: isBig ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.35)',
          },
        ]}
      />
      <ParticleField gift={gift} />

      {isBig ? <GiftFlyThrough gift={gift} /> : null}

      <View style={styles.center}>
        <Text style={[styles.rarity, { color: rarityColor, borderColor: rarityColor }]}>
          {GIFT_RARITY_LABEL[gift.rarity]}
        </Text>

        <Animated.View
          entering={ZoomIn.springify().damping(14)}
          style={[
            styles.emojiCard,
            {
              backgroundColor: gift.gradient[0],
              shadowColor: gift.glow,
            },
          ]}
        >
          <Text style={[styles.emoji, { fontSize: isBig ? 86 : 56 }]}>
            {gift.emoji}
          </Text>
        </Animated.View>

        <Animated.View
          entering={SlideInUp.delay(90).duration(420)}
          style={[
            styles.lowFaceGlow,
            {
              borderColor: rarityColor,
              shadowColor: gift.glow,
            },
          ]}
        >
          <Text style={styles.lowFaceText}>LOW FACE GIFT</Text>
        </Animated.View>

        {combo ? (
          <Animated.Text
            entering={ZoomIn.delay(80)}
            style={[styles.combo, { color: rarityColor }]}
          >
            {combo} COMBO
          </Animated.Text>
        ) : null}

        <View style={styles.glass}>
          <Text style={styles.line} numberOfLines={1}>
            <Text style={styles.strong}>{item.senderName}</Text>
            <Text style={styles.dim}> → </Text>
            <Text style={styles.strong}>{item.receiverName}</Text>
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            sent {gift.name}
          </Text>
          <Text style={[styles.coins, { color: rarityColor }]}>
            {item.coins.toLocaleString()} coins
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  vignette: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: '12%',
  },
  flyZone: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    height: 140,
    overflow: 'hidden',
  },
  flyTrail: {
    position: 'absolute',
    top: 73,
    left: -240,
    width: 240,
    height: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(132, 240, 255, 0.9)',
    shadowColor: '#60e7ff',
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  flyEmoji: {
    position: 'absolute',
    top: 10,
    left: -40,
    fontSize: 92,
    textShadowColor: 'rgba(255, 219, 99, 0.9)',
    textShadowRadius: 24,
  },
  rarity: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
    marginBottom: 14,
  },
  emojiCard: {
    width: 148,
    height: 148,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.65,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  emoji: { textAlign: 'center' },
  combo: {
    marginTop: 14,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1,
  },
  lowFaceGlow: {
    minWidth: 170,
    marginTop: -4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    alignItems: 'center',
  },
  lowFaceText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  glass: {
    marginTop: 18,
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  line: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  strong: { color: '#fff', fontWeight: '800' },
  dim: { color: 'rgba(255,255,255,0.55)' },
  sub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  coins: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
});
