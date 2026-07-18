import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme/colors';

export function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { user, hostEarnings, requestPayout, transactions, callsToday } = useApp();

  const pending =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    hostEarnings.managed;

  const history = transactions.filter((t) => t.type === 'earn' || t.type === 'payout').slice(0, 12);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 16 }}
    >
      <Text style={styles.title}>My Earnings</Text>
      <Text style={styles.subtitle}>Withdraw your coins anytime 💖</Text>

      <LinearGradient colors={['#E85A8C', '#F5A3C7']} style={styles.hero}>
        <Text style={styles.heroLabel}>Available balance</Text>
        <Text style={styles.heroValue}>{user.coinBalance}</Text>
        <Text style={styles.heroSub}>coins in your wallet</Text>

        <Pressable style={styles.withdrawBtn} onPress={requestPayout}>
          <Ionicons name="arrow-down-circle" size={22} color={colors.primary} />
          <Text style={styles.withdrawText}>Withdraw</Text>
        </Pressable>
      </LinearGradient>

      {pending > 0 ? (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingLabel}>Ready to withdraw today</Text>
          <Text style={styles.pendingValue}>{pending} coins</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.mini}>
          <Text style={styles.miniValue}>{callsToday}</Text>
          <Text style={styles.miniLabel}>Calls today</Text>
        </View>
        <View style={styles.mini}>
          <Text style={styles.miniValue}>{hostEarnings.call}</Text>
          <Text style={styles.miniLabel}>Call coins</Text>
        </View>
        <View style={styles.mini}>
          <Text style={styles.miniValue}>{hostEarnings.gift}</Text>
          <Text style={styles.miniLabel}>Gift coins</Text>
        </View>
      </View>

      <Text style={styles.section}>History</Text>
      {history.length === 0 ? (
        <Text style={styles.empty}>No earnings yet. Go Online and take a call ✨</Text>
      ) : (
        history.map((tx) => (
          <View key={tx.id} style={styles.tx}>
            <View style={{ flex: 1 }}>
              <Text style={styles.txLabel}>{tx.label}</Text>
              <Text style={styles.txTime}>{new Date(tx.timestamp).toLocaleString()}</Text>
            </View>
            <Text
              style={[
                styles.txAmount,
                { color: tx.type === 'payout' ? colors.danger : colors.success },
              ]}
            >
              {tx.type === 'payout' ? '-' : '+'}
              {tx.amount}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, marginTop: 6, marginBottom: 18 },
  hero: {
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
  },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  heroValue: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '800',
    marginTop: 4,
  },
  heroSub: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  withdrawBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 18,
  },
  withdrawText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  pendingCard: {
    marginTop: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingLabel: { color: colors.textSecondary },
  pendingValue: { color: colors.accent, fontWeight: '800', fontSize: 18 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mini: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniValue: { color: colors.blush, fontWeight: '800', fontSize: 20 },
  miniLabel: { color: colors.textMuted, marginTop: 4, fontSize: 11 },
  section: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 18,
    marginTop: 24,
    marginBottom: 10,
  },
  empty: { color: colors.textSecondary, lineHeight: 20 },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txLabel: { color: colors.text, fontWeight: '600' },
  txTime: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  txAmount: { fontWeight: '800', fontSize: 16 },
});
