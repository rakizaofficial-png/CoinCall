import { BlurView } from 'expo-blur';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  registerPremiumModal,
  type AlertOptions,
  type AlertVariant,
  type PremiumModalAPI,
  type PromptOptions,
  type ToastOptions,
} from './premiumModalApi';

type ToastItem = {
  id: string;
  title: string;
  message?: string;
  variant: AlertVariant;
};

type DialogState =
  | {
      kind: 'alert';
      title: string;
      message: string;
      options: AlertOptions;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: 'choices';
      title: string;
      message: string;
      choices: { label: string; onPress: () => void }[];
    }
  | {
      kind: 'prompt';
      title: string;
      message: string;
      options: PromptOptions;
      onSubmit: (value: string) => void;
    };

const VARIANT_COLORS: Record<AlertVariant, string> = {
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#6C7CFF',
};

function VariantIcon({ variant, size = 28 }: { variant: AlertVariant; size?: number }) {
  const color = VARIANT_COLORS[variant];
  if (variant === 'success') return <CheckCircle2 size={size} color={color} />;
  if (variant === 'error') return <AlertCircle size={size} color={color} />;
  if (variant === 'warning') return <AlertTriangle size={size} color={color} />;
  return <Info size={size} color={color} />;
}

const PremiumModalContext = createContext<PremiumModalAPI | null>(null);

export function usePremiumModal() {
  const ctx = useContext(PremiumModalContext);
  if (!ctx) throw new Error('usePremiumModal requires PremiumModalProvider');
  return ctx;
}

export function PremiumModalProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const scale = useSharedValue(0.92);

  const dismissDialog = useCallback(() => {
    setDialog(null);
    setPromptValue('');
  }, []);

  const toast = useCallback((title: string, message?: string, options?: ToastOptions) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item: ToastItem = {
      id,
      title,
      message,
      variant: options?.variant ?? 'info',
    };
    setToasts((prev) => [...prev.slice(-2), item]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, options?.durationMs ?? 2800);
  }, []);

  const alert = useCallback(
    (title: string, message: string, options?: AlertOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ kind: 'alert', title, message, options: options || {}, resolve });
      }),
    [],
  );

  const confirm = useCallback(
    (title: string, message: string, onConfirm: () => void, confirmLabel = 'OK') => {
      void alert(title, message, { variant: 'warning', confirmLabel, cancelLabel: 'Cancel' }).then(
        (ok) => {
          if (ok) onConfirm();
        },
      );
    },
    [alert],
  );

  const choices = useCallback(
    (title: string, message: string, choicesList: { label: string; onPress: () => void }[]) => {
      setDialog({ kind: 'choices', title, message, choices: choicesList });
    },
    [],
  );

  const prompt = useCallback(
    (
      title: string,
      message: string,
      onSubmit: (value: string) => void,
      options?: PromptOptions,
    ) => {
      setPromptValue(options?.defaultValue || '');
      setDialog({ kind: 'prompt', title, message, options: options || {}, onSubmit });
    },
    [],
  );

  const api = useMemo<PremiumModalAPI>(
    () => ({ toast, alert, confirm, choices, prompt }),
    [alert, choices, confirm, prompt, toast],
  );

  useEffect(() => {
    registerPremiumModal(api);
    return () => registerPremiumModal(null);
  }, [api]);

  useEffect(() => {
    scale.value = dialog ? withSpring(1, { damping: 16, stiffness: 220 }) : 0.92;
  }, [dialog, scale]);

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dialogVariant: AlertVariant =
    dialog?.kind === 'alert' ? dialog.options.variant || 'info' : 'info';

  return (
    <PremiumModalContext.Provider value={api}>
      {children}

      <View pointerEvents="box-none" style={[styles.toastHost, { top: insets.top + 8 }]}>
        {toasts.map((t) => (
          <Animated.View
            key={t.id}
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(180)}
            style={[
              styles.toast,
              { borderColor: `${VARIANT_COLORS[t.variant]}55` },
            ]}
          >
            <VariantIcon variant={t.variant} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toastTitle}>{t.title}</Text>
              {t.message ? <Text style={styles.toastMsg}>{t.message}</Text> : null}
            </View>
          </Animated.View>
        ))}
      </View>

      <Modal visible={Boolean(dialog)} transparent animationType="none" statusBarTranslucent>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={styles.overlay}>
          <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={dismissDialog} />
          <Animated.View
            entering={SlideInDown.springify().damping(18)}
            exiting={SlideOutDown.duration(180)}
            style={[styles.card, cardAnim]}
          >
            <View style={[styles.iconOrb, { backgroundColor: `${VARIANT_COLORS[dialogVariant]}22` }]}>
              <VariantIcon variant={dialogVariant} />
            </View>
            {dialog ? (
              <>
                <Text style={styles.cardTitle}>{dialog.title}</Text>
                <Text style={styles.cardMsg}>{dialog.message}</Text>

                {dialog.kind === 'prompt' ? (
                  <TextInput
                    style={styles.input}
                    value={promptValue}
                    onChangeText={setPromptValue}
                    placeholder={dialog.options.placeholder || 'Type here…'}
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    autoFocus
                  />
                ) : null}

                {dialog.kind === 'choices' ? (
                  <View style={styles.choiceCol}>
                    {dialog.choices.map((c) => (
                      <Pressable
                        key={c.label}
                        style={styles.choiceBtn}
                        onPress={() => {
                          dismissDialog();
                          c.onPress();
                        }}
                      >
                        <Text style={styles.choiceText}>{c.label}</Text>
                      </Pressable>
                    ))}
                    <Pressable style={styles.ghostBtn} onPress={dismissDialog}>
                      <Text style={styles.ghostText}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.row}>
                    <Pressable
                      style={styles.ghostBtn}
                      onPress={() => {
                        if (dialog.kind === 'alert') dialog.resolve(false);
                        dismissDialog();
                      }}
                    >
                      <Text style={styles.ghostText}>
                        {dialog.kind === 'alert'
                          ? dialog.options.cancelLabel || 'Cancel'
                          : 'Cancel'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primaryBtn, { backgroundColor: VARIANT_COLORS[dialogVariant] }]}
                      onPress={() => {
                        if (dialog.kind === 'alert') {
                          dialog.resolve(true);
                          dismissDialog();
                          return;
                        }
                        if (dialog.kind === 'prompt') {
                          const v = promptValue.trim();
                          if (v) dialog.onSubmit(v);
                          dismissDialog();
                        }
                      }}
                    >
                      <Text style={styles.primaryText}>
                        {dialog.kind === 'alert'
                          ? dialog.options.confirmLabel || 'OK'
                          : dialog.kind === 'prompt'
                            ? dialog.options.confirmLabel || 'Submit'
                            : 'OK'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            ) : null}

            <Pressable style={styles.close} onPress={dismissDialog} hitSlop={12}>
              <X size={18} color="rgba(255,255,255,0.55)" />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Modal>
    </PremiumModalContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastHost: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(18,12,28,0.96)',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  toastTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  toastMsg: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 2 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 22,
    backgroundColor: 'rgba(22,16,34,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  iconOrb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: { color: '#fff', fontWeight: '900', fontSize: 20 },
  cardMsg: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  choiceCol: { gap: 8 },
  choiceBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  choiceText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ghostText: { color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
  primaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    minWidth: 96,
    alignItems: 'center',
  },
  primaryText: { color: '#0B0B12', fontWeight: '900' },
  close: { position: 'absolute', top: 14, right: 14 },
});
