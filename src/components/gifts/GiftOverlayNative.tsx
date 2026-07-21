import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInLeft,
  FadeOutRight,
  ZoomIn,
} from 'react-native-reanimated';

export type NativeGiftOverlayItem = {
  id: string;
  emoji: string;
  giftName: string;
  senderName: string;
  receiverName: string;
  coins: number;
};

type Props = {
  item: NativeGiftOverlayItem | null;
  onDone?: () => void;
};

export function GiftOverlayNative({ item, onDone }: Props) {
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => onDone?.(), 3400);
    return () => clearTimeout(t);
  }, [item, onDone]);

  if (!item) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        entering={FadeInLeft.springify().damping(18)}
        exiting={FadeOutRight.duration(280)}
        style={styles.card}
      >
        <Animated.Text entering={ZoomIn.duration(420)} style={styles.emoji}>
          {item.emoji}
        </Animated.Text>
        <View style={styles.copy}>
          <Text style={styles.line} numberOfLines={1}>
            <Text style={styles.strong}>{item.senderName}</Text>
            <Text style={styles.dim}> → </Text>
            <Text style={styles.strong}>{item.receiverName}</Text>
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            sent {item.giftName}
            {item.coins > 0 ? ` · ${item.coins} coins` : ''}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 120,
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 80, 120, 0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emoji: {
    fontSize: 36,
    width: 52,
    textAlign: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  line: { color: '#fff', fontSize: 13, fontWeight: '600' },
  strong: { color: '#fff', fontWeight: '800' },
  dim: { color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 2, fontWeight: '600' },
});
