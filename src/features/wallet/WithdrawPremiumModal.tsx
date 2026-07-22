import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle2,
  History,
  Lock,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type WithdrawModalState =
  | { visible: false }
  | {
      visible: true;
      mode: 'otp' | 'success' | 'error' | 'confirm';
      title: string;
      message: string;
      otpHint?: string;
      amountCoins?: number;
    };

type Props = {
  state: WithdrawModalState;
  onClose: () => void;
  onConfirm?: () => void;
  onViewHistory?: () => void;
};

export function WithdrawPremiumModal({ state, onClose, onConfirm, onViewHistory }: Props) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(state.visible);
    if (state.visible) {
      scale.value = withSequence(withSpring(1.06), withSpring(1));
    }
  }, [state.visible, scale]);

  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!state.visible && !mounted) return null;
  if (!state.visible) return null;

  const isSuccess = state.mode === 'success';
  const isError = state.mode === 'error';
  const accent = isSuccess ? '#22C55E' : isError ? '#EF4444' : '#F5C14C';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={ZoomIn.springify().damping(16)}
          style={[styles.card, { marginBottom: insets.bottom + 24 }, pulse]}
        >
          <LinearGradient
            colors={['#1A1428', '#0E1220']}
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
            <X size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>

          <Animated.View entering={FadeIn.delay(80)} style={[styles.orb, { backgroundColor: `${accent}22` }]}>
            {isSuccess ? (
              <CheckCircle2 size={36} color={accent} />
            ) : isError ? (
              <XCircle size={36} color={accent} />
            ) : state.mode === 'otp' ? (
              <ShieldCheck size={36} color={accent} />
            ) : (
              <Lock size={36} color={accent} />
            )}
          </Animated.View>

          <Text style={styles.title}>{state.title}</Text>
          <Text style={styles.msg}>{state.message}</Text>
          {state.otpHint ? (
            <View style={styles.otpBox}>
              <Text style={styles.otpLabel}>Verification code</Text>
              <Text style={styles.otpCode}>{state.otpHint}</Text>
            </View>
          ) : null}
          {state.amountCoins ? (
            <Text style={styles.amount}>{state.amountCoins.toLocaleString()} coins</Text>
          ) : null}

          <View style={styles.actions}>
            {state.mode === 'confirm' || state.mode === 'otp' ? (
              <Pressable style={[styles.btn, { backgroundColor: accent }]} onPress={onConfirm}>
                <Text style={styles.btnDark}>
                  {state.mode === 'otp' ? 'Continue' : 'Confirm withdraw'}
                </Text>
              </Pressable>
            ) : null}
            {isSuccess && onViewHistory ? (
              <Pressable style={styles.btnGhost} onPress={onViewHistory}>
                <History size={16} color="#fff" />
                <Text style={styles.btnLight}>View history</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnLight}>{isSuccess || isError ? 'Done' : 'Cancel'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 28,
    padding: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  close: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  orb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 22,
    textAlign: 'center',
  },
  msg: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    fontSize: 14,
  },
  otpBox: {
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(245,193,76,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,193,76,0.35)',
    alignItems: 'center',
  },
  otpLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700' },
  otpCode: {
    color: '#F5C14C',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 6,
    marginTop: 4,
  },
  amount: {
    textAlign: 'center',
    color: '#F5C14C',
    fontWeight: '900',
    fontSize: 20,
    marginTop: 12,
  },
  actions: { marginTop: 20, gap: 10 },
  btn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDark: { color: '#0B0B12', fontWeight: '900', fontSize: 15 },
  btnGhost: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  btnLight: { color: '#fff', fontWeight: '800' },
});
