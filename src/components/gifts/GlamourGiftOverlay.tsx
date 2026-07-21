import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  GIFT_RARITY_COLOR,
  GIFT_RARITY_LABEL,
  resolveGift,
  type GiftItem,
} from '../../data/gifts';

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
      } satisfies GiftItem)
    : null;

  useEffect(() => {
    if (!item || !gift) return;
    const t = setTimeout(() => onDone?.(), gift.animMs);
    return () => clearTimeout(t);
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
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
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
