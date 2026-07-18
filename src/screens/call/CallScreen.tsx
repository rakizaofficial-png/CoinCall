import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { colors } from '../../theme/colors';
import { notify, promptChoices } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function CallScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { getHost, call, endCall, user, reportUser, blockUser } =
    useApp();
  const bridgeCallId = route.params.bridgeCallId;
  const isBridge = Boolean(bridgeCallId);
  const peerHost = !isBridge ? getHost(route.params.hostId) : undefined;
  const peerName =
    route.params.peerName || peerHost?.name || 'Caller';
  const peerAvatar =
    route.params.peerAvatar ||
    peerHost?.avatarUrl ||
    `https://i.pravatar.cc/300?u=${route.params.hostId}`;
  const rate =
    route.params.ratePerMinute || peerHost?.ratePerMinute || 80;
  const channel =
    route.params.channel || (peerHost ? `call_${peerHost.id}` : '');

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [videoStatus, setVideoStatus] = useState('Starting camera...');
  const [bridgeSeconds, setBridgeSeconds] = useState(0);
  const [bridgeCoins, setBridgeCoins] = useState(rate);
  const agoraReady = isAgoraConfigured() && Platform.OS === 'web';
  const activeCallIdRef = useRef<string | null>(null);

  // Legacy host↔host demo call: ensure session exists
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
    if (!agoraReady || !channel) return;
    if (!isBridge && (!call || !peerHost)) return;

    let active = true;
    (async () => {
      try {
        const localEl = document.getElementById('agora-local');
        const remoteEl = document.getElementById('agora-remote');
        if (!localEl || !remoteEl) {
          setVideoStatus('Video containers missing');
          return;
        }

        let uid: number | undefined;
        if (isBridge && bridgeCallId) {
          const tokenPayload = await fetchCallToken(bridgeCallId, 'host');
          uid = tokenPayload.uid;
          setVideoStatus('Connected to Luma user · live');
        }

        await startAgoraCall({
          channel,
          localVideoEl: localEl,
          remoteVideoEl: remoteEl,
          uid,
        });
        if (active) {
          setVideoStatus(
            isBridge
              ? 'Live with Luma user'
              : 'Live · admin can monitor silently',
          );
        }
      } catch (e: any) {
        if (active) {
          setVideoStatus(e?.message || 'Could not start video');
          notify(
            'Video error',
            e?.message ||
              'Check Agora App ID and allow camera/mic in the browser.',
          );
        }
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
  ]);

  const displaySeconds = isBridge ? bridgeSeconds : call?.seconds ?? 0;
  const displayCoins = isBridge ? bridgeCoins : call?.coinsSpent ?? 0;

  const minutesEarned = useMemo(() => {
    return Math.floor(displayCoins / (rate || 1));
  }, [displayCoins, rate]);

  if (!isBridge && (!peerHost || !call)) {
    return <View style={styles.container} />;
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {agoraReady ? (
        <div id="agora-remote" style={webRemoteStyle} />
      ) : (
        <Image source={{ uri: peerAvatar }} style={styles.remote} />
      )}
      <View style={styles.overlay} pointerEvents="none" />

      <View style={styles.topBar}>
        <Text style={styles.timer}>{formatTime(displaySeconds)}</Text>
        <Text style={styles.coins}>
          {isBridge ? 'User call' : 'Earned'} {displayCoins} · {rate}/min
          {minutesEarned ? ` · ~${minutesEarned}m` : ''}
        </Text>
        <Text style={styles.peer}>{peerName}</Text>
        <Text style={styles.videoStatus}>
          {agoraReady
            ? videoStatus
            : 'Demo video (add Agora App ID for real camera)'}
        </Text>
      </View>

      <View style={[styles.localPreview, cameraOff && styles.cameraOff]}>
        {agoraReady ? (
          <div id="agora-local" style={webLocalStyle} />
        ) : cameraOff ? (
          <Ionicons name="videocam-off" size={28} color={colors.text} />
        ) : (
          <Image
            source={{ uri: user.avatarUrl }}
            style={{ width: '100%', height: '100%', borderRadius: 14 }}
          />
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={styles.controlBtn}
          onPress={() => {
            setMuted((v) => {
              const next = !v;
              void setAgoraMuted(next);
              return next;
            });
          }}
        >
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.controlBtn}
          onPress={() => {
            setCameraOff((v) => {
              const next = !v;
              void setAgoraCameraOff(next);
              return next;
            });
          }}
        >
          <Ionicons
            name={cameraOff ? 'videocam-off' : 'videocam'}
            size={22}
            color="#fff"
          />
        </Pressable>
        <Pressable
          style={styles.controlBtn}
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
        >
          <Ionicons name="flag" size={22} color="#fff" />
        </Pressable>
        <Pressable style={[styles.controlBtn, styles.endBtn]} onPress={hangUp}>
          <Ionicons name="call" size={22} color="#fff" />
        </Pressable>
      </View>

      <Text style={styles.spent}>
        {isBridge ? 'Connected via CoinCall bridge' : `Call earnings: ${displayCoins} coins`}
      </Text>
      {!isBridge && (
        <Pressable
          style={styles.blockLink}
          onPress={async () => {
            blockUser(route.params.hostId);
            await hangUp();
            navigation.popToTop();
          }}
        >
          <Text style={styles.blockText}>Block user</Text>
        </Pressable>
      )}
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
  borderRadius: 14,
  overflow: 'hidden' as const,
  background: '#1a1028',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  remote: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,0,20,0.2)',
  },
  topBar: { alignItems: 'center', marginTop: 12, zIndex: 2 },
  timer: { color: colors.text, fontSize: 34, fontWeight: '800' },
  coins: { color: colors.accent, marginTop: 6, fontWeight: '700' },
  peer: { color: colors.text, marginTop: 4, fontWeight: '700', fontSize: 16 },
  videoStatus: {
    color: colors.primarySoft,
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  localPreview: {
    position: 'absolute',
    right: 16,
    top: 120,
    width: 110,
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 2,
  },
  cameraOff: { backgroundColor: '#1a1028' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    zIndex: 2,
  },
  controlBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtn: { backgroundColor: colors.danger, transform: [{ rotate: '135deg' }] },
  spent: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    color: colors.textSecondary,
    zIndex: 2,
  },
  blockLink: { position: 'absolute', bottom: 86, alignSelf: 'center', zIndex: 2 },
  blockText: { color: colors.danger, fontWeight: '700' },
});
