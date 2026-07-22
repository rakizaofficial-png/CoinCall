import { LinearGradient } from 'expo-linear-gradient';
import {
  Coins,
  MapPin,
  PhoneOff,
  Radio,
  Timer,
  Video,
  X,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveStudio } from '../context/LiveStudioContext';
import type { BridgeCall } from '../services/callBridge';
import { acceptBridgeCall, rejectBridgeCall } from '../services/callBridge';
import { env } from '../config/env';
import { pushLiveCallHistory } from '../services/liveCallHistory';
import {
  loadLiveCallSettings,
  type LiveCallSettings,
} from '../services/liveCallSettings';
import type { RootStackParamList } from '../navigation/types';
import { notify } from '../utils/notify';
import { startIncomingRingtone, stopIncomingRingtone } from '../utils/ringtone';

type Props = {
  call: BridgeCall | null;
  onClear: () => void;
  /** Host already in an active private call screen */
  hostBusyOnCall?: boolean;
};

type CallerInfo = {
  coinBalance: number;
  country: string;
};

function safeAvatar(call: BridgeCall) {
  const raw = call.userAvatar || '';
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) {
    return `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(call.userId)}&size=300`;
  }
  return raw;
}

function api() {
  return (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(/\/$/, '');
}

/**
 * Premium incoming call — works over Live and Idle.
 * Accept while LIVE pauses Agora publish but keeps the live room listed.
 */
export function IncomingCallModal({ call, onClear, hostBusyOnCall }: Props) {
  const insets = useSafeAreaInsets();
  const { myLiveRoom, pauseLiveForPrivateCall, livePausedForCall } = useLiveStudio();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'ring' | 'accepting' | 'rejecting'>('ring');
  const [caller, setCaller] = useState<CallerInfo>({ coinBalance: 0, country: '—' });
  const [settings, setSettings] = useState<LiveCallSettings | null>(null);
  const [waitLeft, setWaitLeft] = useState(45);
  const ignoredIds = useRef(new Set<string>());
  const handledRef = useRef(false);
  const pulse = useSharedValue(1);
  const ringScale = useSharedValue(1);

  const isLive = Boolean(myLiveRoom?.isLive || livePausedForCall);

  useEffect(() => {
    void loadLiveCallSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!call) {
      stopIncomingRingtone();
      setPhase('ring');
      handledRef.current = false;
      return;
    }
    if (ignoredIds.current.has(call.id)) {
      onClear();
      return;
    }

    handledRef.current = false;
    startIncomingRingtone();
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.35, { duration: 1200, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 0 }),
      ),
      -1,
      false,
    );

    // Enrich caller profile (coins + country)
    void (async () => {
      try {
        const res = await fetch(`${api()}/wallet/me`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': call.userId,
          },
          body: JSON.stringify({ userId: call.userId }),
        });
        const data = (await res.json()) as {
          wallet?: { coinBalance?: number };
          coinBalance?: number;
          country?: string;
        };
        setCaller({
          coinBalance: Number(
            call.userCoinBalance ?? data.wallet?.coinBalance ?? data.coinBalance ?? 0,
          ),
          country: String(call.userCountry || data.country || 'International'),
        });
      } catch {
        setCaller({
          coinBalance: Number(call.userCoinBalance ?? 0),
          country: String(call.userCountry || 'International'),
        });
      }
    })();

    return () => {
      stopIncomingRingtone();
    };
  }, [call, onClear, pulse, ringScale]);

  // Settings-driven auto reject / wait timeout
  useEffect(() => {
    if (!call || !settings) return;

    if (settings.callAvailability === 'offline') {
      void rejectBridgeCall(call.id).catch(() => undefined);
      onClear();
      return;
    }

    if (
      isLive &&
      !settings.acceptCallsWhileLive
    ) {
      void rejectBridgeCall(call.id).catch(() => undefined);
      void pushLiveCallHistory({
        id: call.id,
        userId: call.userId,
        userName: call.userName,
        userAvatar: call.userAvatar,
        startTime: Date.now(),
        endTime: Date.now(),
        durationSec: 0,
        coinsEarned: 0,
        ratePerMinute: call.ratePerMinute,
        status: 'rejected',
        fromLive: true,
      });
      onClear();
      return;
    }

    if (settings.autoRejectWhenBusy && (hostBusyOnCall || settings.callAvailability === 'busy')) {
      void rejectBridgeCall(call.id).catch(() => undefined);
      void pushLiveCallHistory({
        id: call.id,
        userId: call.userId,
        userName: call.userName,
        startTime: Date.now(),
        endTime: Date.now(),
        durationSec: 0,
        coinsEarned: 0,
        ratePerMinute: call.ratePerMinute,
        status: 'busy',
        fromLive: isLive,
      });
      onClear();
      notify('Auto-rejected', 'You were busy on another call');
      return;
    }

    const max = settings.maxWaitSec || 45;
    setWaitLeft(max);
    const tick = setInterval(() => {
      setWaitLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          if (!handledRef.current) {
            handledRef.current = true;
            void rejectBridgeCall(call.id).catch(() => undefined);
            onClear();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [call, settings, hostBusyOnCall, isLive, onClear]);

  const avatarPulse = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: 2 - ringScale.value,
  }));

  if (!call) return null;

  const rate = settings?.coinsPerMinute || call.ratePerMinute || 80;
  const minutesLeft =
    caller.coinBalance > 0 ? Math.floor(caller.coinBalance / rate) : 0;

  const goToCall = (accepted: BridgeCall) => {
    onClear();
    navigation.navigate('Call', {
      hostId: accepted.userId || call.userId,
      bridgeCallId: accepted.id,
      channel: accepted.channel,
      peerName: accepted.userName,
      peerAvatar: safeAvatar(accepted),
      peerCountry: caller.country,
      peerCoins: caller.coinBalance,
      ratePerMinute: rate,
      role: 'host',
      fromLive: isLive,
      liveRoomId: myLiveRoom?.id,
    });
  };

  const accept = () => {
    if (busy || handledRef.current) return;
    handledRef.current = true;
    setBusy(true);
    setPhase('accepting');
    stopIncomingRingtone();

    const optimistic: BridgeCall = { ...call, ratePerMinute: rate };
    goToCall(optimistic);

    void (async () => {
      try {
        if (myLiveRoom?.isLive) {
          await pauseLiveForPrivateCall();
        }
        await acceptBridgeCall(call.id);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Could not accept call';
        if (message.toLowerCase().includes('accepted')) return;
        notify('Accept failed', message.slice(0, 140));
        if (navigation.canGoBack()) navigation.goBack();
      }
    })();
  };

  const reject = async () => {
    if (busy || handledRef.current) return;
    handledRef.current = true;
    setBusy(true);
    setPhase('rejecting');
    stopIncomingRingtone();
    try {
      await rejectBridgeCall(call.id);
      await pushLiveCallHistory({
        id: call.id,
        userId: call.userId,
        userName: call.userName,
        userAvatar: call.userAvatar,
        country: caller.country,
        startTime: Date.now(),
        endTime: Date.now(),
        durationSec: 0,
        coinsEarned: 0,
        ratePerMinute: rate,
        status: 'rejected',
        fromLive: isLive,
      });
    } catch {
      /* ignore */
    }
    onClear();
    setBusy(false);
    setPhase('ring');
  };

  const ignore = () => {
    if (busy) return;
    ignoredIds.current.add(call.id);
    stopIncomingRingtone();
    onClear();
    notify('Ignored', 'Call dismissed — live continues');
  };

  return (
    <Modal visible animationType="none" transparent statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(180)}
        style={styles.backdrop}
      >
        <LinearGradient
          colors={['rgba(8,4,18,0.92)', 'rgba(20,10,36,0.96)', '#05070F']}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.topMeta, { paddingTop: insets.top + 12 }]}>
          {isLive ? (
            <View style={styles.liveChip}>
              <Radio size={12} color="#fff" />
              <Text style={styles.liveChipText}>LIVE · private call request</Text>
            </View>
          ) : (
            <Text style={styles.label}>Incoming video call</Text>
          )}
          <Pressable onPress={ignore} hitSlop={12} style={styles.ignoreBtn}>
            <X size={18} color="rgba(255,255,255,0.65)" />
            <Text style={styles.ignoreText}>Ignore</Text>
          </Pressable>
        </View>

        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.center}>
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.ripple, rippleStyle]} />
            <Animated.View style={[styles.ripple2, rippleStyle]} />
            <Animated.View style={avatarPulse}>
              <View style={styles.ring}>
                <Image source={{ uri: safeAvatar(call) }} style={styles.avatar} />
              </View>
            </Animated.View>
          </View>

          <Text style={styles.name}>{call.userName}</Text>
          <Text style={styles.uid}>ID {call.userId.slice(0, 10)}</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <MapPin size={14} color="#F5C14C" />
              <Text style={styles.infoText}>{caller.country}</Text>
            </View>
            <View style={styles.infoRow}>
              <Coins size={14} color="#F5C14C" />
              <Text style={styles.infoText}>
                {caller.coinBalance.toLocaleString()} coins
                {minutesLeft > 0 ? ` · ~${minutesLeft} min` : ''}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Timer size={14} color="#22C55E" />
              <Text style={styles.infoText}>
                You earn {rate} coins/min
              </Text>
            </View>
            <Text style={styles.waitHint}>Auto-reject in {waitLeft}s</Text>
          </View>

          {phase === 'accepting' ? (
            <Text style={styles.phaseText}>Connecting…</Text>
          ) : phase === 'rejecting' ? (
            <Text style={[styles.phaseText, { color: '#F87171' }]}>Declining…</Text>
          ) : null}
        </Animated.View>

        <View style={[styles.row, { paddingBottom: insets.bottom + 28 }]}>
          <Pressable
            style={[styles.btn, styles.reject]}
            onPress={() => void reject()}
            disabled={busy}
          >
            <PhoneOff size={28} color="#fff" />
            <Text style={styles.btnLabel}>Reject</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.accept]}
            onPress={accept}
            disabled={busy}
          >
            <LinearGradient
              colors={['#22C55E', '#16A34A']}
              style={styles.acceptGrad}
            >
              <Video size={28} color="#fff" />
            </LinearGradient>
            <Text style={styles.btnLabel}>Accept</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'space-between' },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  label: {
    color: '#F5C14C',
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E11D48',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  liveChipText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  ignoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ignoreText: { color: 'rgba(255,255,255,0.65)', fontWeight: '700', fontSize: 13 },
  center: { alignItems: 'center', paddingHorizontal: 24 },
  avatarWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.45)',
  },
  ripple2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(245,193,76,0.35)',
  },
  ring: {
    padding: 6,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(34,197,94,0.75)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  avatar: { width: 128, height: 128, borderRadius: 64 },
  name: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 18 },
  uid: { color: 'rgba(255,255,255,0.45)', marginTop: 4, fontSize: 12 },
  infoCard: {
    marginTop: 20,
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  waitHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  phaseText: {
    marginTop: 14,
    color: '#22C55E',
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 48,
    alignItems: 'flex-start',
  },
  btn: { alignItems: 'center', width: 88 },
  btnLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 10,
  },
  reject: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accept: { alignItems: 'center' },
  acceptGrad: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});
