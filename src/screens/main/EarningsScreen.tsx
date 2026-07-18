import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowDownCircle,
  Clock,
  Gift,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function EarningsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, hostEarnings, transactions, callsToday, myTodayMinutes } = useApp();
  const { todayLiveGiftCoins, monthlyEarn, liveSeconds } = useLiveStudio();

  const today =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    todayLiveGiftCoins;

  const recent = transactions.slice(0, 8);

  return (
    <Screen
      scroll
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}
    >
      <Text style={[styles.eyebrow, { color: colors.accent }]}>HOST WALLET</Text>
      <Text style={[styles.title, { color: colors.text }]}>Earnings</Text>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>Available balance</Text>
        <Text style={styles.heroValue}>{user.coinBalance}</Text>
        <Text style={styles.heroSub}>coins · today +{today}</Text>
        <PrimaryButton
          label="Withdraw"
          onPress={() => navigation.navigate('Withdraw')}
          style={{ marginTop: 14 }}
        />
      </LinearGradient>

      <View style={styles.grid}>
        {[
          { icon: TrendingUp, label: 'Monthly', value: monthlyEarn },
          { icon: Gift, label: 'Gifts today', value: todayLiveGiftCoins },
          { icon: Users, label: 'Calls', value: callsToday },
          { icon: Clock, label: 'Live mins', value: Math.floor(liveSeconds / 60) || myTodayMinutes },
        ].map((s) => (
          <GlassCard key={s.label} style={styles.stat}>
            <s.icon size={18} color={colors.primarySoft} />
            <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </GlassCard>
        ))}
      </View>

      <GlassCard>
        <Text style={[styles.section, { color: colors.text }]}>Breakdown</Text>
        {(
          [
            ['Calls', hostEarnings.call],
            ['Gifts', hostEarnings.gift + todayLiveGiftCoins],
            ['Tasks', hostEarnings.task],
            ['Invites', hostEarnings.invite],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.breakRow}>
            <Text style={{ color: colors.textSecondary }}>{label}</Text>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{value}</Text>
          </View>
        ))}
      </GlassCard>

      <Pressable
        style={[styles.link, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
        onPress={() => navigation.navigate('Withdraw')}
      >
        <ArrowDownCircle size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>Cash out</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            EasyPaisa · JazzCash · Bank · Crypto
          </Text>
        </View>
        <Wallet size={18} color={colors.primarySoft} />
      </Pressable>

      <Text style={[styles.section, { color: colors.text, marginTop: 18 }]}>
        Recent activity
      </Text>
      {recent.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No transactions yet.</Text>
      ) : (
        recent.map((t) => (
          <View
            key={t.id}
            style={[styles.tx, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{t.label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {new Date(t.timestamp).toLocaleString()}
              </Text>
            </View>
            <Text
              style={{
                color: t.type === 'payout' || t.type === 'spend' ? colors.danger : colors.online,
                fontWeight: '900',
              }}
            >
              {t.type === 'payout' || t.type === 'spend' ? '-' : '+'}
              {t.amount}
            </Text>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  title: { fontSize: 30, fontWeight: '900', marginTop: 4, marginBottom: 14 },
  hero: { borderRadius: radii.xl, padding: 22, marginBottom: 14 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 48, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.8)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  stat: { width: '48%', gap: 6 },
  statValue: { fontWeight: '900', fontSize: 22 },
  statLabel: { fontSize: 12 },
  section: { fontWeight: '900', fontSize: 16, marginBottom: 10 },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  link: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 14,
    minHeight: 64,
  },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
});
