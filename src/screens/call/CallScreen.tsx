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
  const { getHost, call, endCall, user, reportUser, blockUser } = useApp();
  const host = getHost(route.params.hostId);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [videoStatus, setVideoStatus] = useState('Starting camera...');
  const agoraReady = isAgoraConfigured() && Platform.OS === 'web';
  const activeCallIdRef = useRef<string | null>(null);
  const channel = host ? `call_${host.id}` : '';

  useEffect(() => {
    if (!call || call.status === 'ended') {
      navigation.goBack();
    }
  }, [call, navigation]);

  useEffect(() => {
    if (!call || !host || call.status !== 'active') return;
    let cancelled = false;
    (async () => {
      const record = await publishActiveCall({
        channel,
        hostUid: user.id,
        hostName: user.name,
        hostAvatar: user.avatarUrl,
        peerId: host.id,
        peerName: host.name,
      });
      if (!cancelled && record) activeCallIdRef.current = record.id;
    })();
    return () => {
      cancelled = true;
      const id = activeCallIdRef.current;
      activeCallIdRef.current = null;
      void endActiveCall(id);
    };
  }, [call?.status, channel, host?.id, host?.name, user.avatarUrl, user.id, user.name]);

  useEffect(() => {
    if (!call || !activeCallIdRef.current) return;
    void updateActiveCall(activeCallIdRef.current, {
      seconds: call.seconds,
      coinsEarned: call.coinsSpent,
    });
  }, [call?.seconds, call?.coinsSpent]);

  useEffect(() => {
    if (!agoraReady || !call || !host) return;

    let active = true;
    (async () => {
      try {
        const localEl = document.getElementById('agora-local');
        const remoteEl = document.getElementById('agora-remote');
        if (!localEl || !remoteEl) {
          setVideoStatus('Video containers missing');
          return;
        }
        await startAgoraCall({
          channel,
          localVideoEl: localEl,
          remoteVideoEl: remoteEl,
        });
        if (active) setVideoStatus('Live · admin can monitor silently');
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
  }, [agoraReady, call?.hostId, channel, host?.id]);

  const minutesEarned = useMemo(() => {
    if (!call || !host) return 0;
    return Math.floor(call.coinsSpent / (host.ratePerMinute || 1));
  }, [call, host]);

  if (!host || !call) {
    return <View style={styles.container} />;
  }

  const hangUp = async () => {
    await stopAgoraCall();
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
        <Image source={{ uri: host.avatarUrl }} style={styles.remote} />
      )}
      <View style={styles.overlay} pointerEvents="none" />

      <View style={styles.topBar}>
        <Text style={styles.timer}>{formatTime(call.seconds)}</Text>
        <Text style={styles.coins}>
          Earned {call.coinsSpent} · {host.ratePerMinute}/min
          {minutesEarned ? ` · ~${minutesEarned}m` : ''}
        </Text>
        <Text style={styles.videoStatus}>
          {agoraReady ? videoStatus : 'Demo video (add Agora App ID for real camera)'}
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
              { label: 'Abuse', onPress: () => reportUser(host.id, 'Abuse') },
              { label: 'Spam', onPress: () => reportUser(host.id, 'Spam') },
            ])
          }
        >
          <Ionicons name="flag" size={22} color="#fff" />
        </Pressable>
        <Pressable style={[styles.controlBtn, styles.endBtn]} onPress={hangUp}>
          <Ionicons name="call" size={22} color="#fff" />
        </Pressable>
      </View>

      <Text style={styles.spent}>Call earnings: {call.coinsSpent} coins</Text>
      <Pressable
        style={styles.blockLink}
        onPress={async () => {
          blockUser(host.id);
          await hangUp();
          navigation.popToTop();
        }}
      >
        <Text style={styles.blockText}>Block user</Text>
      </Pressable>
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
