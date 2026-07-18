import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Flag,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Signal,
  Video,
  VideoOff,
  Volume2,
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
import type { RootStackParamList } from '../../navigation/types';
import {
  isAgoraConfigured,
  setAgoraCameraOff,
  setAgoraMuted,
  startAgoraCall,
  stopAgoraCall,
} from '../../services/agoraService';
import { endBridgeCall, fetchCallToken } from '../../services/callBridge';
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
  const { getHost, call, endCall, user, reportUser, blockUser, beautyOn } = useApp();
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
  const [speakerOn, setSpeakerOn] = useState(true);
  const [videoStatus, setVideoStatus] = useState('Starting camera...');
  const [bridgeSeconds, setBridgeSeconds] = useState(0);
  const [bridgeCoins, setBridgeCoins] = useState(rate);
  const [surfacesReady, setSurfacesReady] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [netQuality] = useState<'Excellent' | 'Good' | 'Fair'>('Good');
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
          });
        } else {
          await startAgoraCall({
            channel,
            localVideoEl: localEl,
            remoteVideoEl: remoteEl,
          });
        }

        if (active) {
          setVideoStatus(
            isBridge ? 'Live with user · video on' : 'Live video connected',
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
          { borderColor: colors.glassBorder },
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
              filter: beautyOn
                ? 'brightness(1.08) contrast(1.05) saturate(1.15) blur(0.2px)'
                : 'none',
            }}
          />
        ) : cameraOff ? (
          <VideoOff size={28} color="#fff" />
        ) : (
          <Image
            source={{ uri: user.avatarUrl }}
            style={{ width: '100%', height: '100%', borderRadius: 16 }}
          />
        )}
      </View>

      {reaction ? (
        <View style={styles.reactionBurst} pointerEvents="none">
          <Text style={styles.reactionEmoji}>{reaction}</Text>
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
          icon={Volume2}
          label="Speaker"
          active={speakerOn}
          onPress={() => setSpeakerOn((v) => !v)}
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
        <IconButton
          icon={Settings}
          label="More"
          onPress={() => {
            if (!isBridge) {
              promptChoices('Call settings', 'Choose', [
                {
                  label: 'Block user',
                  onPress: async () => {
                    blockUser(route.params.hostId);
                    await hangUp();
                    navigation.popToTop();
                  },
                },
              ]);
            } else {
              notify('Settings', speakerOn ? 'Speaker on' : 'Speaker off');
            }
          }}
        />
        <IconButton icon={PhoneOff} label="Leave" danger onPress={hangUp} />
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
  borderRadius: 16,
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
    right: 16,
    top: 150,
    width: 112,
    height: 152,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    zIndex: 3,
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
