import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
};

export function Screen({
  children,
  scroll,
  padded = true,
  style,
  contentContainerStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const pad = {
    paddingTop: insets.top + 8,
    paddingBottom: insets.bottom + 24,
    paddingHorizontal: padded ? 16 : 0,
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }, style]}>
      <LinearGradient
        colors={[`${colors.gradientStart}33`, 'transparent']}
        style={styles.topGlow}
        pointerEvents="none"
      />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, pad, contentContainerStyle as ViewStyle]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
});
