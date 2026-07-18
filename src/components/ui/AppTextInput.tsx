import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type Props = TextInputProps & {
  onClear?: () => void;
};

export function AppTextInput(props: Props) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.border,
          color: colors.text,
        },
        props.style,
      ]}
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.segItem, on && { backgroundColor: colors.primary }]}
          >
            <Text
              style={{
                color: on ? '#fff' : colors.textSecondary,
                fontWeight: '800',
                fontSize: 13,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 52,
  },
  seg: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 44,
  },
});
