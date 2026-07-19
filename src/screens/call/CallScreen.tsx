import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Gift,
  Mic,
  MicOff,
  PhoneOff,
  Signal,
  Sparkles,
  SwitchCamera,
  Video,
  VideoOff,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../../components/ui/IconButton';
import { useApp } from '../../context/AppContext';
import { GIFT_CATALOG } from '../../data/gifts';
import type { RootStackParamList } from '../../navigation/types';
import {
  type BeautyPreset,
  beautyCssFilter,
  isAgoraConfigured,
  setAgoraBeauty,
  setAgoraCameraOff,
  setAgoraMuted,
  startAgoraCall,
  stopAgoraCall,
  switchAgoraCamera,
} from '../../services/agoraService';
import { endBridgeCall, fetchCallToken, watchBridgeCallEnd } from '../../services/callBridge';
import {
  type GiftRequest,
  listenGiftRequestEvents,
  requestGiftFromUser,
} from '../../services/giftRequestService';
import {
  endActiveCall,
  publishActiveCall,
  updateActiveCall,
} from '../../services/realtimeService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

const BEAUTY_CYCLE: BeautyPreset[] = ['snap', 'glamour', 'natural', 'off'];

function nextBeauty(current: BeautyPreset): BeautyPreset {
  const i = BEAUTY_CYCLE.indexOf(current);
  return BEAUTY_CYCLE[(i + 1) % BEAUTY_CYCLE.length];
}

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
  const [cameraOff, setCameraOff] = useState(false);
  const [videoStatus, setVideoStatus] = useState('Starting camera...');
  const [bridgeSeconds, setBridgeSeconds] = useState(0);
  const [bridgeCoins, setBridgeCoins] = useState(rate);
  const [surfacesReady, setSurfacesReady] = useState(false);
  const [netQuality] = useState<'Excellent' | 'Good' | 'Fair'>('Good');
  const [beautyPreset, setBeautyPreset] = useState<BeautyPreset>(
    beautyOn ? 'snap' : 'off',
  );
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);
  const [giftBusy, setGiftBusy] = useState(false);
  const [pendingGiftReq, setPendingGiftReq] = useState<GiftRequest | null>(null);
  const [giftBurst, setGiftBurst] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const agoraReady = isAgoraConfigured() && Platform.OS === 'web';
  const activeCallIdRef = useRef<string | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const remoteRef = useRef<HTMLDivElement | null>(null);
  const leavingRef = useRef(false);

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

  useEffect(() => {
    if (isBridge) return;
    if (!call || call.status !== 'active' || !peerHost) return;
    let cancelled = false;
    (async () => {
      const record = await publishActiveCall({
        channel,
        hostUid: user.id,
        hostName: user.name,
        hostAvatar: user.avatarUrl,
        peerId: peerHost.id,
        peerName: peerHost.name,
      });
      if (!cancelled && record) activeCallIdRef.current = record.id;
    })();
    return () => {
      cancelled = true;
      const id = activeCallIdRef.current;
      activeCallIdRef.current = null;
      void endActiveCall(id);
    };
  }, [
    call?.status,
    channel,
    isBridge,
    peerHost?.id,
    peerHost?.name,
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

  useEffect(() => {
    if (!agoraReady || !channel || !surfacesReady) return;
    if (!isBridge && (!call || !peerHost)) return;

    let active = true;
    (async () => {
      try {
        const localEl = await waitForEl(() => localRef.current);
        const remoteEl = await waitForEl(() => remoteRef.current);
        if (!active) return;

        setVideoStatus('Joining secure room…');

        if (isBridge && bridgeCallId) {
          const tokenPayload = await fetchCallToken(bridgeCallId, 'host');
          if (!active) return;
          await startAgoraCall({
            channel: tokenPayload.channel || channel,
            localVideoEl: localEl,
            remoteVideoEl: remoteEl,
            uid: tokenPayload.uid,
            token: tokenPayload.token,
            appId: tokenPayload.appId,
            beauty: beautyPreset,
          });
        } else {
          await startAgoraCall({
            channel,
            localVideoEl: localEl,
            remoteVideoEl: remoteEl,
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
    bridgeCallId,
    call?.hostId,
    channel,
    isBridge,
    peerHost?.id,
    surfacesReady,
  ]);

  useEffect(() => {
    if (!bridgeCallId) return;
    return listenGiftRequestEvents(bridgeCallId, (type, gift) => {
      if (type === 'gift:accepted') {
        setPendingGiftReq(null);
        setGiftBurst(`${gift.giftEmoji} ${gift.giftName}`);
        setTimeout(() => setGiftBurst(null), 2800);
      } else if (type === 'gift:declined') {
        setPendingGiftReq(null);
        notify('Gift declined', `${peerName} declined your request`);
      } else if (type === 'gift:expired') {
        setPendingGiftReq(null);
        notify('Gift request expired', 'User did not respond in time');
      } else if (type === 'gift:request') {
        setPendingGiftReq(gift);
      }
    });
  }, [bridgeCallId, peerName]);

  useEffect(() => {
    if (!bridgeCallId || !user.id) return;
    return watchBridgeCallEnd(user.id, bridgeCallId, () => {
      void leaveAfterDisconnect();
    });
  }, [bridgeCallId, leaveAfterDisconnect, user.id]);

  const sendGiftRequest = async (giftId: string) => {
    if (!bridgeCallId) {
      notify('Gift request', 'Available on live user calls.');
      return;
    }
    // Host must never gift / request as themselves to themselves
    if (user.id === route.params.hostId) {
      notify('Gift', 'Hosts cannot gift themselves!');
      return;
    }
    if (pendingGiftReq?.status === 'pending') {
      notify('Waiting', 'User still has a pending gift request.');
      return;
    }
    setGiftBusy(true);
    try {
      const gift = GIFT_CATALOG.find((g) => g.id === giftId);
      const req = await requestGiftFromUser({
        callId: bridgeCallId,
        giftId,
        message: `${user.name} is requesting ${gift?.emoji || ''} ${gift?.name || 'a gift'} 💕`,
      });
      setPendingGiftReq(req);
      setGiftPickerOpen(false);
      notify('Request sent', `Waiting for ${peerName} to accept…`);
    } catch (e) {
      notify('Gift request failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setGiftBusy(false);
    }
  };

  /** Gift accept comes from the user app */
  const displaySeconds = isBridge ? bridgeSeconds : call?.seconds ?? 0;
  const displayCoins = isBridge ? bridgeCoins : call?.coinsSpent ?? 0;
  const minutesEarned = useMemo(() => {
    return Math.floor(displayCoins / (rate || 1));
  }, [displayCoins, rate]);

  if (!isBridge && (!peerHost || !call)) {
    return <View style={[styles.container, { backgroundColor: colors.bg }]} />;
  }

  const hangUp = async () => {
    if (leavingRef.current) return;
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
        <div
          ref={(el: HTMLDivElement | null) => {
            remoteRef.current = el;
            if (el && localRef.current) setSurfacesReady(true);
          }}
          id="agora-remote"
          style={webRemoteStyle}
        />
      ) : (
        <Image source={{ uri: peerAvatar }} style={styles.remote} />
      )}

      <View style={[styles.overlay, { backgroundColor: colors.overlay }]} pointerEvents="none" />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topRow}>
          <View style={styles.timerPill}>
            <View style={styles.liveDot} />
            <Text style={styles.timer}>{formatTime(displaySeconds)}</Text>
          </View>
          <View style={styles.netPill}>
            <Signal size={13} color={netColor} />
            <Text style={[styles.netText, { color: netColor }]}>{netQuality}</Text>
          </View>
        </View>
        <Text style={styles.peer}>{peerName}</Text>
        <Text style={styles.coins}>
          {displayCoins} coins · {rate}/min
          {minutesEarned ? ` · ~${minutesEarned}m` : ''}
        </Text>
      </View>

      {/* PiP self-view */}
      <View style={[styles.localPreview, cameraOff && { backgroundColor: '#121826' }]}>
        {agoraReady ? (
          <div
            ref={(el: HTMLDivElement | null) => {
              localRef.current = el;
              if (el && remoteRef.current) setSurfacesReady(true);
            }}
            id="agora-local"
            style={{
              ...webLocalStyle,
              filter: beautyCssFilter(beautyPreset),
            }}
          />
        ) : cameraOff ? (
          <VideoOff size={22} color="#fff" />
        ) : (
          <Image
            source={{ uri: user.avatarUrl }}
            style={{ width: '100%', height: '100%', borderRadius: 16 }}
          />
        )}
        {beautyPreset !== 'off' ? (
          <View style={styles.beautyBadge}>
            <Sparkles size={10} color="#fff" />
            <Text style={styles.beautyBadgeText}>{beautyPreset}</Text>
          </View>
        ) : null}
      </View>

      {giftBurst ? (
        <View style={styles.giftBurst} pointerEvents="none">
          <Text style={styles.giftBurstEmoji}>{giftBurst.split(' ')[0]}</Text>
          <Text style={styles.giftBurstText}>{giftBurst}</Text>
        </View>
      ) : null}

      {pendingGiftReq?.status === 'pending' ? (
        <View style={[styles.pendingBanner, { bottom: insets.bottom + 110 }]}>
          <Text style={styles.pendingText}>
            Waiting for {peerName} · {pendingGiftReq.giftEmoji} {pendingGiftReq.giftName}
          </Text>
        </View>
      ) : null}

      {disconnected ? (
        <View style={styles.disconnectOverlay} pointerEvents="none">
          <PhoneOff size={36} color="#fff" />
          <Text style={styles.disconnectTitle}>Disconnected</Text>
          <Text style={styles.disconnectSub}>Call ended</Text>
        </View>
      ) : null}

      <View style={[styles.controlPanel, { paddingBottom: insets.bottom + 18 }]}>
        <IconButton
          icon={muted ? MicOff : Mic}
          label={muted ? 'Unmute' : 'Mute'}
          active={!muted}
          onPress={() => {
            setMuted((v) => {
              const next = !v;
              void setAgoraMuted(next);
              return next;
            });
          }}
        />
        <IconButton
          icon={SwitchCamera}
          label="Flip"
          onPress={() => void switchAgoraCamera()}
        />
        <IconButton icon={PhoneOff} label="End" danger onPress={hangUp} />
      </View>
    </View>
  );
}

const webRemoteStyle = {
  position: 'absolute' as const,
  inset: 0,
  width: '100%',
  height: '100%',
  background: '#000',
};

const webLocalStyle = {
  width: '100%',
  height: '100%',
  borderRadius: 18,
  overflow: 'hidden' as const,
  background: '#121826',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  remote: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFill },
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
  topBar: { alignItems: 'center', zIndex: 2, gap: 6, paddingHorizontal: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E11D48' },
  timer: { color: '#fff', fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  netPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  netText: { fontSize: 11, fontWeight: '700' },
  peer: { color: '#fff', fontWeight: '800', fontSize: 18 },
  coins: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', fontSize: 12 },
  localPreview: {
    position: 'absolute',
    right: 14,
    top: 120,
    width: 100,
    height: 140,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    zIndex: 3,
    backgroundColor: '#0a0c14',
  },
  beautyBadge: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(108,124,255,0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  beautyBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  giftBurst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  giftBurstEmoji: { fontSize: 80 },
  giftBurstText: { color: '#fff', fontWeight: '900', fontSize: 18, marginTop: 8 },
  pendingBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(245,193,76,0.95)',
    borderRadius: 14,
    padding: 12,
    zIndex: 5,
    alignItems: 'center',
  },
  pendingText: { color: '#1a1200', fontWeight: '800', textAlign: 'center', fontSize: 13 },
  controlPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(5,7,15,0.72)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    zIndex: 4,
  },
  giftSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,10,18,0.97)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 36,
    zIndex: 20,
  },
  giftSheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  giftSheetSub: { color: 'rgba(255,255,255,0.55)', marginBottom: 14, fontSize: 13 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  giftItem: {
    width: '30%',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 12,
  },
  giftEmoji: { fontSize: 28 },
  giftName: { color: '#fff', fontWeight: '700', fontSize: 12, marginTop: 4 },
  giftCoins: { color: '#F5C14C', fontWeight: '800', fontSize: 11, marginTop: 2 },
  giftClose: { color: '#9B8CFF', textAlign: 'center', marginTop: 16, fontWeight: '800' },
});
