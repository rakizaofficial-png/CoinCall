import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text } from 'react-native';
import { radii } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

/** Legacy wrapper — keeps existing call sites working */
export function GradientButton({ label, onPress, disabled }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={disabled && styles.disabled}
    >
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btn}
      >
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  label: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.55,
  },
});
