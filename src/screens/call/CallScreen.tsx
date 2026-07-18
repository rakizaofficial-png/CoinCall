import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Flag,
  Gift,
  Mic,
  MicOff,
  PhoneOff,
  Signal,
  Sparkles,
  Video,
  VideoOff,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
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
} from '../../services/agoraService';
import { endBridgeCall, fetchCallToken } from '../../services/callBridge';
import {
  type GiftRequest,
  listenGiftRequestEvents,
  requestGiftFromUser,
  respondToGiftRequest,
} from '../../services/giftRequestService';
import {
  endActiveCall,
  publishActiveCall,
  updateActiveCall,
} from '../../services/realtimeService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify, promptChoices } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

const REACTIONS = ['❤️', '🔥', '👏', '😍', '✨', '🎉'];
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

function MicPulse({ active }: { active: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = active
      ? withRepeat(withTiming(1.18, { duration: 700 }), -1, true)
      : withTiming(1, { duration: 200 });
  }, [active, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[styles.micPulse, style]} />;
}

export function CallScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getHost, call, endCall, user, reportUser, beautyOn } =
    useApp();
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
  const [reaction, setReaction] = useState<string | null>(null);
  const [netQuality] = useState<'Excellent' | 'Good' | 'Fair'>('Good');
  const [beautyPreset, setBeautyPreset] = useState<BeautyPreset>(
    beautyOn ? 'snap' : 'off',
  );
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);
  const [giftBusy, setGiftBusy] = useState(false);
  const [pendingGiftReq, setPendingGiftReq] = useState<GiftRequest | null>(null);
  const [giftBurst, setGiftBurst] = useState<string | null>(null);
  const agoraReady = isAgoraConfigured() && Platform.OS === 'web';
  const activeCallIdRef = useRef<string | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const remoteRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isBridge) return;
    if (!call || call.status === 'ended') {
      navigation.goBack();
    }
  }, [call, isBridge, navigation]);

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
    if (!reaction) return;
    const t = setTimeout(() => setReaction(null), 1600);
    return () => clearTimeout(t);
  }, [reaction]);

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

  const sendGiftRequest = async (giftId: string) => {
    if (!bridgeCallId) {
      notify('Gift request', 'Available on live user calls.');
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

  /** Demo: simulate user accept from host (dev / when user app not open) */
  const demoAcceptAsUser = async () => {
    if (!bridgeCallId || !pendingGiftReq) return;
    setGiftBusy(true);
    try {
      const result = await respondToGiftRequest({
        callId: bridgeCallId,
        requestId: pendingGiftReq.id,
        action: 'accept',
        userId: pendingGiftReq.userId,
      });
      setPendingGiftReq(null);
      setGiftBurst(`${result.giftEmoji} ${result.giftName}`);
      setTimeout(() => setGiftBurst(null), 2800);
    } catch (e) {
      notify('Accept failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setGiftBusy(false);
    }
  };

  const displaySeconds = isBridge ? bridgeSeconds : call?.seconds ?? 0;
  const displayCoins = isBridge ? bridgeCoins : call?.coinsSpent ?? 0;

  const minutesEarned = useMemo(() => {
    return Math.floor(displayCoins / (rate || 1));
  }, [displayCoins, rate]);

  if (!isBridge && (!peerHost || !call)) {
    return <View style={[styles.container, { backgroundColor: colors.bg }]} />;
  }

  const hangUp = async () => {
    await stopAgoraCall();
    if (bridgeCallId) {
      try {
        await endBridgeCall(bridgeCallId);
      } catch {
        // ignore
      }
    }
    const id = activeCallIdRef.current;
    activeCallIdRef.current = null;
    await endActiveCall(id);
    endCall();
    navigation.goBack();
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

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.timerPill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.timer}>{formatTime(displaySeconds)}</Text>
        </View>

        <View style={[styles.netPill, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Signal size={14} color={netColor} />
          <Text style={[styles.netText, { color: netColor }]}>{netQuality}</Text>
        </View>

        <Text style={styles.peer}>{peerName}</Text>
        <Text style={[styles.coins, { color: colors.accent }]}>
          {isBridge ? 'User call' : 'Earned'} {displayCoins} · {rate}/min
          {minutesEarned ? ` · ~${minutesEarned}m` : ''}
        </Text>
        <Text style={[styles.videoStatus, { color: colors.primarySoft }]}>
          {agoraReady ? videoStatus : 'Connecting video…'}
        </Text>
      </View>

      {/* Large participant avatars / local preview */}
      <View style={styles.participants}>
        <View style={styles.participantCard}>
          <Avatar uri={peerAvatar} size={72} online />
          <Text style={styles.participantName} numberOfLines={1}>
            {peerName}
          </Text>
        </View>
        <View style={styles.participantCard}>
          <Avatar uri={user.avatarUrl} size={72} online ring />
          <Text style={styles.participantName} numberOfLines={1}>
            You
          </Text>
          {!muted ? <MicPulse active /> : null}
        </View>
      </View>

      <View
        style={[
          styles.localPreview,
          cameraOff && { backgroundColor: '#121826' },
          {
            borderColor:
              beautyPreset === 'off' ? colors.glassBorder : 'rgba(255,182,220,0.85)',
          },
        ]}
      >
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
            style={{ width: '100%', height: '100%', borderRadius: 18 }}
          />
        )}
        <View style={styles.beautyBadge}>
          <Sparkles size={10} color="#fff" />
          <Text style={styles.beautyBadgeText}>
            {beautyPreset === 'off' ? 'Raw' : beautyPreset}
          </Text>
        </View>
      </View>

      {reaction ? (
        <View style={styles.reactionBurst} pointerEvents="none">
          <Text style={styles.reactionEmoji}>{reaction}</Text>
        </View>
      ) : null}

      {giftBurst ? (
        <View style={styles.giftBurst} pointerEvents="none">
          <Text style={styles.giftBurstEmoji}>{giftBurst.split(' ')[0]}</Text>
          <Text style={styles.giftBurstText}>{giftBurst}</Text>
        </View>
      ) : null}

      {pendingGiftReq?.status === 'pending' ? (
        <View style={[styles.pendingBanner, { bottom: insets.bottom + 168 }]}>
          <Text style={styles.pendingText}>
            Waiting for {peerName} to send {pendingGiftReq.giftEmoji}{' '}
            {pendingGiftReq.giftName}…
          </Text>
          {__DEV__ ? (
            <Pressable onPress={() => void demoAcceptAsUser()} style={styles.demoAccept}>
              <Text style={styles.demoAcceptText}>
                {giftBusy ? '…' : 'Demo: user accepts'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.reactions, { bottom: insets.bottom + 128 }]}>
        {REACTIONS.map((e) => (
          <Pressable
            key={e}
            accessibilityRole="button"
            accessibilityLabel={`React ${e}`}
            hitSlop={6}
            onPress={() => setReaction(e)}
            style={[styles.reactionBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          >
            <Text style={{ fontSize: 18 }}>{e}</Text>
          </Pressable>
        ))}
      </View>

      <View
        style={[
          styles.controlPanel,
          {
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.glass,
            borderColor: colors.glassBorder,
          },
        ]}
      >
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
          icon={cameraOff ? VideoOff : Video}
          label="Video"
          active={!cameraOff}
          onPress={() => {
            setCameraOff((v) => {
              const next = !v;
              void setAgoraCameraOff(next);
              return next;
            });
          }}
        />
        <IconButton
          icon={Gift}
          label="Ask gift"
          active={Boolean(pendingGiftReq)}
          onPress={() => {
            if (!isBridge) {
              notify('Ask gift', 'Gift requests work on live user calls.');
              return;
            }
            setGiftPickerOpen(true);
          }}
        />
        <IconButton
          icon={Sparkles}
          label={beautyPreset === 'off' ? 'Beauty' : beautyPreset}
          active={beautyPreset !== 'off'}
          onPress={() => {
            const next = nextBeauty(beautyPreset);
            setBeautyPreset(next);
            void setAgoraBeauty(next);
            notify(
              'Beauty filter',
              next === 'off'
                ? 'Beauty off'
                : next === 'snap'
                  ? 'Snapchat · world beauty ON'
                  : `${next} beauty ON`,
            );
          }}
        />
        <IconButton
          icon={Flag}
          label="Report"
          onPress={() =>
            promptChoices('Report', 'Reason?', [
              {
                label: 'Abuse',
                onPress: () => reportUser(route.params.hostId, 'Abuse'),
              },
              {
                label: 'Spam',
                onPress: () => reportUser(route.params.hostId, 'Spam'),
              },
            ])
          }
        />
        <IconButton icon={PhoneOff} label="Leave" danger onPress={hangUp} />
      </View>

      {giftPickerOpen ? (
        <View style={styles.giftSheet}>
          <Text style={styles.giftSheetTitle}>Request a gift</Text>
          <Text style={styles.giftSheetSub}>
            {peerName} will see this and can Accept or Decline
          </Text>
          <View style={styles.giftGrid}>
            {GIFT_CATALOG.map((g) => (
              <Pressable
                key={g.id}
                style={styles.giftItem}
                disabled={giftBusy}
                onPress={() => void sendGiftRequest(g.id)}
              >
                <Text style={styles.giftEmoji}>{g.emoji}</Text>
                <Text style={styles.giftName}>{g.name}</Text>
                <Text style={styles.giftCoins}>{g.coins}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setGiftPickerOpen(false)}>
            <Text style={styles.giftClose}>Close</Text>
          </Pressable>
        </View>
      ) : null}
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
  topBar: { alignItems: 'center', zIndex: 2, gap: 8 },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  timer: { color: '#fff', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  netPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  netText: { fontSize: 12, fontWeight: '700' },
  peer: { color: '#fff', fontWeight: '800', fontSize: 20 },
  coins: { fontWeight: '700', fontSize: 13 },
  videoStatus: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  participants: {
    position: 'absolute',
    top: '28%',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    zIndex: 2,
  },
  participantCard: { alignItems: 'center', width: 96 },
  participantName: {
    color: '#fff',
    marginTop: 8,
    fontWeight: '700',
    fontSize: 13,
  },
  micPulse: {
    position: 'absolute',
    bottom: -4,
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: 'rgba(108,124,255,0.55)',
  },
  localPreview: {
    position: 'absolute',
    right: 14,
    top: 140,
    width: 86,
    height: 118,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    zIndex: 3,
    shadowColor: '#FF8DC7',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  beautyBadge: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,105,180,0.75)',
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
  reactions: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 4,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  reactionBurst: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  reactionEmoji: { fontSize: 72 },
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
    backgroundColor: 'rgba(245,193,76,0.92)',
    borderRadius: 14,
    padding: 12,
    zIndex: 5,
    alignItems: 'center',
    gap: 8,
  },
  pendingText: { color: '#1a1200', fontWeight: '800', textAlign: 'center', fontSize: 13 },
  demoAccept: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  demoAcceptText: { color: '#1a1200', fontWeight: '900', fontSize: 12 },
  giftSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#121826',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 36,
    zIndex: 20,
  },
  giftSheetTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
  giftSheetSub: { color: 'rgba(255,255,255,0.6)', marginTop: 4, marginBottom: 12, fontSize: 12 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  giftItem: {
    width: '22%',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 10,
  },
  giftEmoji: { fontSize: 28 },
  giftName: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4 },
  giftCoins: { color: '#F5C14C', fontSize: 11, fontWeight: '800' },
  giftClose: {
    color: '#9B8CFF',
    textAlign: 'center',
    marginTop: 14,
    fontWeight: '800',
  },
  controlPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 8,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    zIndex: 4,
  },
});
