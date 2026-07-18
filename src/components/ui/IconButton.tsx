import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  icon: LucideIcon;
  label?: string;
  onPress?: () => void;
  active?: boolean;
  danger?: boolean;
  size?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function IconButton({
  icon: Icon,
  label,
  onPress,
  active,
  danger,
  size = 56,
  style,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const bg = danger
    ? colors.danger
    : active
      ? colors.primary
      : 'rgba(255,255,255,0.14)';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        { width: size + (label ? 8 : 0), opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <View
        style={[
          styles.btn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
            borderColor: colors.glassBorder,
          },
        ]}
      >
        <Icon size={size * 0.38} color="#fff" strokeWidth={2.2} />
      </View>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
