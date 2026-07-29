import { Lock } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  entryFee: number;
  balance?: number;
  paying?: boolean;
  error?: string;
  onPay: () => void;
  onDecline: () => void;
};

export function LockedRoomPaywallOverlay({
  visible,
  entryFee,
  balance,
  paying,
  error,
  onPay,
  onDecline,
}: Props) {
  if (!visible) return null;
  const notEnough = typeof balance === 'number' && balance < entryFee;
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Lock size={34} color="#F5C14C" />
        </View>
        <Text style={styles.title}>Premium live locked</Text>
        <Text style={styles.body}>
          Pay {entryFee.toLocaleString()} coins to stay in this live room.
        </Text>
        {typeof balance === 'number' ? (
          <Text style={styles.balance}>Balance: {balance.toLocaleString()} coins</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          disabled={paying || notEnough}
          onPress={onPay}
          style={[styles.payButton, (paying || notEnough) && styles.disabled]}
        >
          <Text style={styles.payText}>
            {paying
              ? 'Processing...'
              : notEnough
                ? 'Not enough coins'
                : `Pay ${entryFee.toLocaleString()} coins`}
          </Text>
        </Pressable>
        <Pressable onPress={onDecline} style={styles.leaveButton}>
          <Text style={styles.leaveText}>Leave live</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    backgroundColor: '#0E0A14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  icon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,193,76,0.14)',
    marginBottom: 14,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  body: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  balance: { color: '#F5C14C', fontSize: 12, fontWeight: '800', marginTop: 14 },
  error: { color: '#FF6B8A', fontSize: 12, fontWeight: '700', marginTop: 10 },
  payButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5C14C',
    marginTop: 18,
  },
  disabled: { opacity: 0.5 },
  payText: { color: '#120B04', fontSize: 14, fontWeight: '900' },
  leaveButton: { marginTop: 14, padding: 8 },
  leaveText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '800' },
});

