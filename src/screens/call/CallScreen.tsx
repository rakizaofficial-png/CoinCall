import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Mic,
  MicOff,
  PhoneOff,
  Signal,
  SwitchCamera,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AgoraCallSurfaces,
  getWebVideoElements,
} from '../../components/call/AgoraCallSurfaces';
import { useApp } from '../../context/AppContext';
import type { RootStackParamList } from '../../navigation/types';
import {
  type BeautyPreset,
  isAgoraConfigured,
  setAgoraMuted,
  startAgoraCall,
  stopAgoraCall,
  switchAgoraCamera,
} from '../../services/agoraService';
import { endBridgeCall, fetchCallToken, watchBridgeCallEnd } from '../../services/callBridge';
import { listenGiftRequestEvents } from '../../services/giftRequestService';
import {
  endActiveCall,
  endCallSession,
  listenCallSessionEnded,
  publishActiveCall,
  updateActiveCall,
  upsertCallSession,
} from '../../services/realtimeService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}


function waitForEl(
  getter: () => HTMLElement | null,
  tries = 30,
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      const el = getter();
      if (el) {
        resolve(el);
        return;
      }
      n += 1;
      if (n >= tries) {
        reject(new Error('Video surface not ready'));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export function CallScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getHost, call, endCall, user, beautyOn } = useApp();
  const bridgeCallId = route.params.bridgeCallId;
  const isBridge = Boolean(bridgeCallId);
  const peerHost = !isBridge ? getHost(route.params.hostId) : undefined;
  const peerName = route.params.peerName || peerHost?.name || 'Caller';
  const peerAvatar =
    route.params.peerAvatar ||
    peerHost?.avatarUrl ||
    `https://i.pravatar.cc/300?u=${route.params.hostId}`;
  const rate = route.params.ratePerMinute || peerHost?.ratePerMinute || 80;
  const channel =
    route.params.channel || (peerHost ? `call_${peerHost.id}` : '');

  const [muted, setMuted] = useState(false);
  const [, setVideoStatus] = useState('Starting camera...');
  const [bridgeSeconds, setBridgeSeconds] = useState(0);
  const [bridgeCoins, setBridgeCoins] = useState(rate);
  const [surfacesReady, setSurfacesReady] = useState(false);
  const [netQuality] = useState<'Excellent' | 'Good' | 'Fair'>('Good');
  const [beautyPreset] = useState<BeautyPreset>(beautyOn ? 'snap' : 'off');
  const [giftBurst, setGiftBurst] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const agoraReady = isAgoraConfigured();
  const isWeb = Platform.OS === 'web';
  const activeCallIdRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const leavingRef = useRef(false);
  const markSurfacesReady = useCallback(() => setSurfacesReady(true), []);

  const leaveAfterDisconnect = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setDisconnected(true);
    await stopAgoraCall();
    const id = activeCallIdRef.current;
    activeCallIdRef.current = null;
    await endActiveCall(id);
    endCall();
    setTimeout(() => {
      navigation.goBack();
    }, 1600);
  }, [endCall, navigation]);

  useEffect(() => {
    if (isBridge) return;
    if (!call || call.status === 'ended') {
      if (call?.status === 'ended') {
        void leaveAfterDisconnect();
      } else if (!call) {
        navigation.goBack();
      }
    }
  }, [call, isBridge, leaveAfterDisconnect, navigation]);

  useEffect(() => {
    if (!isBridge) return;
    const t = setInterval(() => {
      setBridgeSeconds((s) => {
        const next = s + 1;
        if (next > 0 && next % 60 === 0) {
          setBridgeCoins((c) => c + rate);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isBridge, rate]);

  // Publish shared Firebase session for BOTH demo + bridge calls
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isBridge && bridgeCallId) {
        const callerId = route.params.hostId || 'caller';
        const record = await upsertCallSession({
          id: bridgeCallId,
          channel,
          hostId: user.id,
          hostName: user.name,
          hostAvatar: user.avatarUrl,
          userId: callerId,
          userName: peerName,
          userAvatar: peerAvatar,
          ratePerMinute: rate,
        });
        if (!cancelled && record) {
          activeCallIdRef.current = record.id;
          setSessionId(record.id);
        }
        return;
      }
      if (!call || call.status !== 'active' || !peerHost) return;
      const record = await publishActiveCall({
        channel,
        hostUid: user.id,
        hostName: user.name,
        hostAvatar: user.avatarUrl,
        peerId: peerHost.id,
        peerName: peerHost.name,
      });
      if (!cancelled && record) {
        activeCallIdRef.current = record.id;
        setSessionId(record.id);
        await upsertCallSession({
          id: record.id,
          channel,
          hostId: user.id,
          hostName: user.name,
          hostAvatar: user.avatarUrl,
          userId: peerHost.id,
          userName: peerHost.name,
          userAvatar: peerHost.avatarUrl,
          ratePerMinute: rate,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    bridgeCallId,
    call?.status,
    channel,
    isBridge,
    peerAvatar,
    peerHost?.avatarUrl,
    peerHost?.id,
    peerHost?.name,
    peerName,
    rate,
    route.params.hostId,
    user.avatarUrl,
    user.id,
    user.name,
  ]);

  useEffect(() => {
    if (isBridge || !call || !activeCallIdRef.current) return;
    void updateActiveCall(activeCallIdRef.current, {
      seconds: call.seconds,
      coinsEarned: call.coinsSpent,
    });
  }, [call?.seconds, call?.coinsSpent, isBridge]);

  // Synced end: when callSessions/{id}.status === ended, BOTH sides leave
  useEffect(() => {
    const sid = bridgeCallId || sessionId;
    if (!sid) return;
    return listenCallSessionEnded(sid, () => {
      void leaveAfterDisconnect();
    });
  }, [bridgeCallId, leaveAfterDisconnect, sessionId]);

  useEffect(() => {
    if (!agoraReady || !channel || !surfacesReady) return;
    if (!isBridge && (!call || !peerHost)) return;

    let active = true;
    (async () => {
      try {
        let localEl: HTMLElement | null = null;
        let remoteEl: HTMLElement | null = null;
        if (isWeb) {
          localEl = await waitForEl(() => getWebVideoElements().local);
          remoteEl = await waitForEl(() => getWebVideoElements().remote);
        }
        if (!active) return;

        setVideoStatus('Joining secure room…');

        if (isBridge && bridgeCallId) {
          const tokenPayload = await fetchCallToken(bridgeCallId, 'host');
          if (!active) return;
          await startAgoraCall({
            channel: tokenPayload.channel || channel,
            localVideoEl: localEl ?? undefined,
            remoteVideoEl: remoteEl ?? undefined,
            uid: tokenPayload.uid,
            token: tokenPayload.token,
            appId: tokenPayload.appId,
            beauty: beautyPreset,
          });
        } else {
          await startAgoraCall({
            channel,
            localVideoEl: localEl ?? undefined,
            remoteVideoEl: remoteEl ?? undefined,
            beauty: beautyPreset,
          });
        }

        if (active) {
          setVideoStatus(
            isBridge
              ? `Live · beauty ${beautyPreset}`
              : `Live video · beauty ${beautyPreset}`,
          );
        }
      } catch (e: unknown) {
        if (!active) return;
        const message =
          e instanceof Error ? e.message : 'Could not start video';
        setVideoStatus(message);
        notify(
          'Video error',
          `${message}. Allow camera/mic, then reopen the call.`,
        );
      }
    })();

    return () => {
      active = false;
      void stopAgoraCall();
    };
  }, [
    agoraReady,
    beautyPreset,
    bridgeCallId,
    call?.hostId,
    channel,
    isBridge,
    isWeb,
    peerHost?.id,
    surfacesReady,
  ]);

  useEffect(() => {
    if (!bridgeCallId) return;
    return listenGiftRequestEvents(bridgeCallId, (type, gift) => {
      if (type === 'gift:accepted') {
        setGiftBurst(`${gift.giftEmoji} ${gift.giftName}`);
        setTimeout(() => setGiftBurst(null), 2800);
      } else if (type === 'gift:declined') {
        notify('Gift declined', `${peerName} declined your request`);
      } else if (type === 'gift:expired') {
        notify('Gift request expired', 'User did not respond in time');
      }
    });
  }, [bridgeCallId, peerName]);

  useEffect(() => {
    if (!bridgeCallId || !user.id) return;
    return watchBridgeCallEnd(user.id, bridgeCallId, () => {
      void leaveAfterDisconnect();
    });
  }, [bridgeCallId, leaveAfterDisconnect, user.id]);

  const displaySeconds = isBridge ? bridgeSeconds : call?.seconds ?? 0;
  const displayCoins = isBridge ? bridgeCoins : call?.coinsSpent ?? 0;

  if (!isBridge && (!peerHost || !call)) {
    return <View style={[styles.container, { backgroundColor: colors.bg }]} />;
  }

  const hangUp = async () => {
    if (leavingRef.current) return;
    const sid = bridgeCallId || sessionId || activeCallIdRef.current;
    // Status → ended first so BOTH sides leave via RTDB listener
    if (sid) {
      await endCallSession(sid, 'host_hangup').catch(() => undefined);
    }
    if (bridgeCallId) {
      try {
        await endBridgeCall(bridgeCallId);
      } catch {
        // ignore
      }
    }
    await leaveAfterDisconnect();
  };

  const netColor =
    netQuality === 'Excellent'
      ? colors.online
      : netQuality === 'Good'
        ? colors.accent
        : colors.danger;

  return (
    <View style={[styles.container, { backgroundColor: '#05070F' }]}>
      {agoraReady ? (
        <AgoraCallSurfaces onSurfacesReady={markSurfacesReady} />
      ) : (
        <>
          <Image source={{ uri: peerAvatar }} style={styles.remote} />
          <View style={styles.localPreview}>
            <Image
              source={{ uri: user.avatarUrl }}
              style={{ width: '100%', height: '100%', borderRadius: 20 }}
            />
          </View>
        </>
      )}

      <View style={[styles.overlay]} pointerEvents="none" />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.glassRow}>
          <View style={styles.glassPill}>
            <View style={styles.liveDot} />
            <Text style={styles.timer}>{formatTime(displaySeconds)}</Text>
          </View>
          <View style={styles.glassPill}>
            <Signal size={13} color={netColor} />
            <Text style={[styles.netText, { color: netColor }]}>{netQuality}</Text>
          </View>
        </View>
        <View style={styles.namePill}>
          <Text style={styles.peer}>{peerName}</Text>
          <Text style={styles.coins}>
            {displayCoins} coins · {rate}/min
          </Text>
        </View>
      </View>

      {giftBurst ? (
        <View style={styles.giftBurst} pointerEvents="none">
          <Text style={styles.giftBurstEmoji}>{giftBurst.split(' ')[0]}</Text>
          <Text style={styles.giftBurstText}>{giftBurst}</Text>
        </View>
      ) : null}

      {disconnected ? (
        <View style={styles.disconnectOverlay} pointerEvents="none">
          <PhoneOff size={36} color="#fff" />
          <Text style={styles.disconnectTitle}>Disconnected</Text>
          <Text style={styles.disconnectSub}>Call ended</Text>
        </View>
      ) : null}

      <View style={[styles.fabColumn, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={styles.fab}
          onPress={() => {
            setMuted((v) => {
              const next = !v;
              void setAgoraMuted(next);
              return next;
            });
          }}
        >
          {muted ? <MicOff size={20} color="#fff" /> : <Mic size={20} color="#fff" />}
        </Pressable>
        <Pressable style={styles.fab} onPress={() => void switchAgoraCamera()}>
          <SwitchCamera size={20} color="#fff" />
        </Pressable>
        <Pressable style={styles.fabEnd} onPress={hangUp}>
          <PhoneOff size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  remote: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  disconnectOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(5,7,15,0.82)',
  },
  disconnectTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  disconnectSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    gap: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  glassRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  namePill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E11D48' },
  timer: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  netText: { fontSize: 11, fontWeight: '700' },
  peer: { color: '#fff', fontWeight: '800', fontSize: 16 },
  coins: { color: 'rgba(255,255,255,0.78)', fontWeight: '600', fontSize: 11, marginTop: 2 },
  localPreview: {
    position: 'absolute',
    right: 14,
    top: 128,
    width: 104,
    height: 146,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    zIndex: 3,
    backgroundColor: '#0a0c14',
    shadowColor: '#ff4d7a',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  giftBurst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  giftBurstEmoji: { fontSize: 80 },
  giftBurstText: { color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 8 },
  fabColumn: {
    position: 'absolute',
    right: 14,
    bottom: 0,
    zIndex: 4,
    alignItems: 'center',
    gap: 12,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  fabEnd: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff2d55',
    shadowColor: '#ff2d55',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
});
