import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BridgeCall } from '../services/callBridge';
import { acceptBridgeCall, rejectBridgeCall } from '../services/callBridge';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { notify } from '../utils/notify';

type Props = {
  call: BridgeCall | null;
  onClear: () => void;
};

export function IncomingCallModal({ call, onClear }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!call) return null;

  const accept = async () => {
    try {
      await acceptBridgeCall(call.id);
      onClear();
      navigation.navigate('Call', {
        hostId: call.userId,
        bridgeCallId: call.id,
        channel: call.channel,
        peerName: call.userName,
        peerAvatar: call.userAvatar,
        ratePerMinute: call.ratePerMinute,
        role: 'host',
      });
    } catch (e: any) {
      notify('Accept failed', e?.message || 'Could not accept call');
    }
  };

  const reject = async () => {
    try {
      await rejectBridgeCall(call.id);
    } catch {
      // ignore
    }
    onClear();
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.label}>Incoming CoinCall</Text>
          <Image
            source={{
              uri:
                call.userAvatar ||
                `https://i.pravatar.cc/300?u=${encodeURIComponent(call.userId)}`,
            }}
            style={styles.avatar}
          />
          <Text style={styles.name}>{call.userName}</Text>
          <Text style={styles.meta}>
            User calling · {call.ratePerMinute} coins/min
          </Text>
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.reject]} onPress={reject}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Pressable style={[styles.btn, styles.accept]} onPress={accept}>
              <Ionicons name="videocam" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bgCard,
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.accent,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  avatar: { width: 96, height: 96, borderRadius: 48, marginTop: 18 },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 14,
  },
  meta: { color: colors.textSecondary, marginTop: 6 },
  row: { flexDirection: 'row', gap: 28, marginTop: 28 },
  btn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reject: { backgroundColor: colors.danger },
  accept: { backgroundColor: colors.online },
});
