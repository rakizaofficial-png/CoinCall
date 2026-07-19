import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { premium, premiumSpace } from '../../theme/premium';

export function FontBootstrap() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'coincall-premium-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&display=swap';
    document.head.appendChild(link);
  }, []);
  return null;
}

export function PremiumShell({
  children,
  padded = true,
}: {
  children: ReactNode;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.shell, { paddingTop: insets.top + 8 }]}>
      <LinearGradient
        colors={[...premium.gradHero]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orbRose} />
      <View style={styles.orbTeal} />
      <View style={[styles.shellInner, padded && { paddingHorizontal: 18 }]}>{children}</View>
    </View>
  );
}

export function DisplayText({
  children,
  style,
  size = 30,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  size?: number;
}) {
  return (
    <Text
      style={[
        {
          fontFamily: Platform.OS === 'web' ? premium.fonts.display : undefined,
          fontSize: size,
          fontWeight: '800',
          color: premium.text,
          letterSpacing: -0.7,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function BodyText({
  children,
  style,
  mute,
  soft,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  mute?: boolean;
  soft?: boolean;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: Platform.OS === 'web' ? premium.fonts.body : undefined,
          fontSize: 14,
          fontWeight: '500',
          color: mute ? premium.textMute : soft ? premium.textSoft : premium.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function GlassPanel({
  children,
  style,
  pad = 16,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pad?: number;
}) {
  return (
    <View style={[styles.glass, { padding: pad }, style]}>
      <LinearGradient
        colors={[...premium.gradCard]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ zIndex: 1 }}>{children}</View>
    </View>
  );
}

export function SectionLabel({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <BodyText style={styles.sectionTitle}>{title}</BodyText>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <BodyText style={{ color: premium.teal, fontWeight: '700', fontSize: 13 }}>
            {action}
          </BodyText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SoftPress({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start()
        }
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function GradientCTA({
  label,
  onPress,
  tone = 'rose',
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'rose' | 'teal';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = tone === 'teal' ? premium.gradTeal : premium.gradRose;
  return (
    <SoftPress onPress={onPress} style={style}>
      <LinearGradient colors={[...colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
        <Text style={styles.ctaText}>{label}</Text>
      </LinearGradient>
    </SoftPress>
  );
}

export function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <GlassPanel style={styles.stat} pad={14}>
      <BodyText mute style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </BodyText>
      <DisplayText size={22} style={{ color: accent || premium.text, marginTop: 4 }}>
        {value}
      </DisplayText>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: premium.ink },
  shellInner: { flex: 1 },
  orbRose: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,77,109,0.16)',
  },
  orbTeal: {
    position: 'absolute',
    bottom: 120,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(45,212,191,0.10)',
  },
  glass: {
    borderRadius: premium.radius.lg,
    borderWidth: 1,
    borderColor: premium.line,
    backgroundColor: premium.glass,
    overflow: 'hidden',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: premiumSpace.sm,
    marginTop: premiumSpace.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: premium.textSoft,
    textTransform: 'uppercase',
  },
  cta: {
    minHeight: 52,
    borderRadius: premium.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.2,
    fontFamily: Platform.OS === 'web' ? premium.fonts.body : undefined,
  },
  stat: { flex: 1, minWidth: '46%' },
});
