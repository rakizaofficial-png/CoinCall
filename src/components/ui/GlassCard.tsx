import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  children: React.ReactNode;
  intensity?: number;
  gradient?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function GlassCard({ children, intensity = 40, gradient, style }: Props) {
  const { colors, isDark } = useTheme();

  if (gradient) {
    return (
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, { shadowColor: colors.shadow }, style]}
      >
        {children}
      </LinearGradient>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View
        style={[
          styles.base,
          {
            borderColor: colors.glassBorder,
            shadowColor: colors.shadow,
            overflow: 'hidden',
          },
          style,
        ]}
      >
        <BlurView
          intensity={intensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ padding: 0 }}>{children}</View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.glass,
          borderColor: colors.glassBorder,
          shadowColor: colors.shadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
});
