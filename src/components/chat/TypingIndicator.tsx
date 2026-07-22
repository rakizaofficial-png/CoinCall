import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { CHAT_THEME } from './chatTheme';

export function TypingIndicator({ label = 'typing…' }: { label?: string }) {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.3, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dot, { opacity: a }]} />
      <Animated.View style={[styles.dot, { opacity: a }]} />
      <Animated.View style={[styles.dot, { opacity: a }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: CHAT_THEME.theirsBubble,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_THEME.border,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHAT_THEME.accent,
  },
  label: { marginLeft: 4, fontSize: 11, color: CHAT_THEME.muted, fontWeight: '600' },
});
