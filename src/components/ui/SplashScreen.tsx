import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';

export function SplashScreen() {
  const { colors } = useTheme();
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
    opacity.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [opacity, scale]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        style={styles.glow}
      />
      <Animated.View style={[styles.badge, anim]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.logo}
        >
          <Text style={styles.mark}>C</Text>
        </LinearGradient>
      </Animated.View>
      <Text style={[styles.title, { color: colors.text }]}>CoinCall</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Premium host studio
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.25,
  },
  badge: { marginBottom: 18 },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { color: '#fff', fontSize: 40, fontWeight: '900' },
  title: { fontSize: 36, fontWeight: '800', letterSpacing: -0.8 },
  sub: { marginTop: 8, fontSize: 15, fontWeight: '600' },
});
