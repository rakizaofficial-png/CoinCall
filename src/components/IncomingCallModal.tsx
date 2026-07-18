import { PhoneOff, Video } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BridgeCall } from '../services/callBridge';
import { acceptBridgeCall, rejectBridgeCall } from '../services/callBridge';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { notify } from '../utils/notify';
import { startIncomingRingtone, stopIncomingRingtone } from '../utils/ringtone';

type Props = {
  call: BridgeCall | null;
  onClear: () => void;
};

function safeAvatar(call: BridgeCall) {
  const raw = call.userAvatar || '';
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) {
    return `https://i.pravatar.cc/300?u=${encodeURIComponent(call.userId)}`;
  }
  return raw;
}

export function IncomingCallModal({ call, onClear }: Props) {
  const { colors } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [busy, setBusy] = useState(false);
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!call) {
      stopIncomingRingtone();
      return;
    }
    startIncomingRingtone();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.14,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      stopIncomingRingtone();
    };
  }, [call, pulse]);

  if (!call) return null;

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    stopIncomingRingtone();
    try {
      const { call: accepted } = await acceptBridgeCall(call.id);
      onClear();
      navigation.navigate('Call', {
        hostId: accepted.userId || call.userId,
        bridgeCallId: accepted.id,
        channel: accepted.channel,
        peerName: accepted.userName,
        peerAvatar: safeAvatar(accepted),
        ratePerMinute: accepted.ratePerMinute,
        role: 'host',
      });
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'Could not accept call';
      // Still try to open call room if already accepted
      if (message.toLowerCase().includes('accepted')) {
        onClear();
        navigation.navigate('Call', {
          hostId: call.userId,
          bridgeCallId: call.id,
          channel: call.channel,
          peerName: call.userName,
          peerAvatar: safeAvatar(call),
          ratePerMinute: call.ratePerMinute,
          role: 'host',
        });
        return;
      }
      notify('Accept failed', message.slice(0, 140));
      setBusy(false);
    }
  };

  const reject = async () => {
    if (busy) return;
    setBusy(true);
    stopIncomingRingtone();
    try {
      await rejectBridgeCall(call.id);
    } catch {
      // ignore
    }
    onClear();
    setBusy(false);
  };

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.glow} />
        <Text style={styles.label}>Incoming video call</Text>
        <Text style={styles.sub}>Luma user · CoinCall</Text>

        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <View style={styles.ring}>
            <Image source={{ uri: safeAvatar(call) }} style={styles.avatar} />
          </View>
        </Animated.View>

        <Text style={styles.name}>{call.userName}</Text>
        <Text style={styles.meta}>
          Ringing · {call.ratePerMinute} coins/min
        </Text>

        <View style={styles.row}>
          <Pressable
            style={[styles.btn, styles.reject]}
            onPress={reject}
            disabled={busy}
          >
            <PhoneOff size={28} color="#fff" />
            <Text style={styles.btnLabel}>Decline</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.accept, { backgroundColor: colors.online }]}
            onPress={accept}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Video size={28} color="#fff" />
            )}
            <Text style={styles.btnLabel}>Attend</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0B0610',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(232,90,140,0.22)',
    top: '22%',
  },
  label: {
    color: colors.accent,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  sub: { color: colors.textSecondary, marginTop: 6, marginBottom: 28 },
  ring: {
    padding: 8,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(61,214,140,0.65)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  avatar: { width: 128, height: 128, borderRadius: 64 },
  name: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    marginTop: 22,
  },
  meta: { color: colors.textSecondary, marginTop: 8, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    gap: 36,
    marginTop: 48,
    alignItems: 'flex-start',
  },
  btn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    position: 'absolute',
    bottom: -22,
    width: 80,
  },
  reject: {
    backgroundColor: colors.danger,
  },
  accept: { backgroundColor: colors.online },
});
