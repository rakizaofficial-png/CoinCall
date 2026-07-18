import { ArrowDownCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function EarningsScreen() {
  const { colors } = useTheme();
  const { user, hostEarnings, requestPayout, transactions, callsToday } = useApp();

  const pending =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    hostEarnings.managed;

  const history = transactions.filter((t) => t.type === 'earn' || t.type === 'payout').slice(0, 12);

  return (
    <Screen scroll contentContainerStyle={{ paddingBottom: 110 }}>
      <Text style={[styles.title, { color: colors.text }]}>My Earnings</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Withdraw your coins anytime
      </Text>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>Available balance</Text>
        <Text style={styles.heroValue}>{user.coinBalance}</Text>
        <Text style={styles.heroSub}>coins in your wallet</Text>

        <Pressable
          style={styles.withdrawBtn}
          onPress={requestPayout}
          accessibilityRole="button"
          accessibilityLabel="Cash out via EasyPaisa"
        >
          <ArrowDownCircle size={22} color={colors.primary} />
          <Text style={[styles.withdrawText, { color: colors.primary }]}>
            Cash-Out · EasyPaisa
          </Text>
        </Pressable>
      </LinearGradient>

      {pending > 0 ? (
        <View
          style={[
            styles.pendingCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.textSecondary }}>Ready to withdraw today</Text>
          <Text style={[styles.pendingValue, { color: colors.accent }]}>
            {pending} coins
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        {[
          { v: callsToday, l: 'Calls today' },
          { v: hostEarnings.call, l: 'Call coins' },
          { v: hostEarnings.gift, l: 'Gift coins' },
        ].map((m) => (
          <View
            key={m.l}
            style={[
              styles.mini,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.miniValue, { color: colors.blush }]}>{m.v}</Text>
            <Text style={[styles.miniLabel, { color: colors.textMuted }]}>{m.l}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>History</Text>
      {history.length === 0 ? (
        <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
          No earnings yet. Go Online and take a call.
        </Text>
      ) : (
        history.map((tx) => (
          <View
            key={tx.id}
            style={[styles.tx, { borderBottomColor: colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.txLabel, { color: colors.text }]}>{tx.label}</Text>
              <Text style={[styles.txTime, { color: colors.textMuted }]}>
                {new Date(tx.timestamp).toLocaleString()}
              </Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 6, marginBottom: 18 },
  hero: {
    borderRadius: radii.xl,
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
    minHeight: 52,
  },
  withdrawText: { fontWeight: '800', fontSize: 16 },
  pendingCard: {
    marginTop: 12,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingValue: { fontWeight: '800', fontSize: 18 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mini: {
    flex: 1,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  miniValue: { fontWeight: '800', fontSize: 20 },
  miniLabel: { marginTop: 4, fontSize: 11 },
  section: {
    fontWeight: '800',
    fontSize: 18,
    marginTop: 24,
    marginBottom: 10,
  },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  txLabel: { fontWeight: '600' },
  txTime: { fontSize: 11, marginTop: 2 },
  txAmount: { fontWeight: '800', fontSize: 16 },
});
