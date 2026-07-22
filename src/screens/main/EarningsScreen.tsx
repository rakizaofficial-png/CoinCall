import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowDownCircle,
  Clock,
  Gift,
  Phone,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import {
  fetchHostEarnings,
  formatDuration,
  type HostCallHistoryRow,
  type HostEarningsPayload,
  type HostGiftHistoryRow,
} from '../../services/hostEarningsApi';
import {
  fetchHostWeeklyEarnings,
  type WeeklyEarningsRow,
} from '../../services/realtimeService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function EarningsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const [payload, setPayload] = useState<HostEarningsPayload | null>(null);
  const [weekly, setWeekly] = useState<WeeklyEarningsRow | null>(null);
  const [fbStats, setFbStats] = useState<{
    totalCallCoins: number;
    totalMinutes: number;
    totalCalls: number;
  } | null>(null);
  const [fbBalance, setFbBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user.id) return;
    setLoading(true);
    try {
      const [data, fb] = await Promise.all([
        fetchHostEarnings(user.id).catch(() => null),
        fetchHostWeeklyEarnings(user.id).catch(() => null),
      ]);
      if (data) setPayload(data);
      else setPayload(null);
      if (fb) {
        setWeekly(fb.week);
        setFbStats(fb.stats);
        setFbBalance(fb.walletBalance);
      }
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const summary = payload?.summary;
  const calls: HostCallHistoryRow[] = payload?.calls || [];
  const gifts: HostGiftHistoryRow[] = payload?.gifts || [];
  const callCoins = Math.max(
    summary?.callCoins ?? 0,
    fbStats?.totalCallCoins ?? 0,
    weekly?.coins ?? 0,
  );
  const giftCoins = Math.max(summary?.giftCoins ?? 0, weekly?.giftCoins ?? 0);
  const totalCoins = Math.max(summary?.totalCoins ?? 0, callCoins + giftCoins);
  const balance =
    typeof fbBalance === 'number' && fbBalance >= 0
      ? fbBalance
      : typeof summary?.walletBalance === 'number'
        ? summary.walletBalance
        : user.coinBalance;
  const totalCalls = Math.max(
    summary?.totalCalls ?? 0,
    fbStats?.totalCalls ?? 0,
    weekly?.callCount ?? 0,
  );
  const totalDurationSec = Math.max(
    summary?.totalDurationSec ?? 0,
    (fbStats?.totalMinutes ?? 0) * 60,
    (weekly?.callMinutes ?? 0) * 60,
  );

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
        <Text style={styles.heroValue}>{balance}</Text>
        <Text style={styles.heroSub}>
          total earned {totalCoins} coins
          {loading ? ' · syncing…' : ''}
        </Text>
        <PrimaryButton
          label="Withdraw"
          onPress={() => navigation.navigate('Withdraw')}
          style={{ marginTop: 14 }}
        />
      </LinearGradient>

      <View style={styles.grid}>
        {[
          { icon: TrendingUp, label: 'Total earned', value: totalCoins },
          { icon: Phone, label: 'Call coins', value: callCoins },
          { icon: Gift, label: 'Gift coins', value: giftCoins },
          {
            icon: Users,
            label: 'Calls',
            value: totalCalls,
          },
          {
            icon: Clock,
            label: 'Call time',
            value: formatDuration(totalDurationSec),
          },
          {
            icon: Gift,
            label: 'Gifts',
            value: summary?.totalGifts ?? 0,
          },
        ].map((s) => (
          <GlassCard key={s.label} style={styles.stat}>
            <s.icon size={18} color={colors.primarySoft} />
            <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </GlassCard>
        ))}
      </View>

      <GlassCard>
        <Text style={[styles.section, { color: colors.text }]}>
          This week · withdrawal ledger
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
          {weekly?.weekKey || 'Current week'} · persists across refresh
        </Text>
        {(
          [
            ['Weekly call coins', weekly?.coins ?? 0],
            ['Weekly minutes', weekly?.callMinutes ?? 0],
            ['Weekly calls', weekly?.callCount ?? 0],
            ['Weekly gifts', weekly?.giftCoins ?? 0],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.breakRow}>
            <Text style={{ color: colors.textSecondary }}>{label}</Text>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{value}</Text>
          </View>
        ))}
      </GlassCard>

      <GlassCard>
        <Text style={[styles.section, { color: colors.text }]}>Revenue breakdown</Text>
        {(
          [
            ['Calls', callCoins],
            ['Gifting', giftCoins],
            ['Combined total', totalCoins],
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
        Call Analytics
      </Text>
      {calls.length === 0 ? (
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
          No calls recorded yet.
        </Text>
      ) : (
        calls.slice(0, 12).map((c) => (
          <View
            key={c.id}
            style={[styles.tx, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {c.userName || 'Caller'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {new Date(c.startedAt).toLocaleString()} · {formatDuration(c.durationSec)}
              </Text>
            </View>
            <Text style={{ color: colors.online, fontWeight: '900' }}>+{c.coinsSpent}</Text>
          </View>
        ))
      )}

      <Text style={[styles.section, { color: colors.text, marginTop: 10 }]}>
        Gifts received
      </Text>
      {gifts.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No gifts yet.</Text>
      ) : (
        gifts.slice(0, 20).map((g) => (
          <View
            key={g.id}
            style={[styles.tx, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
          >
            <Text style={{ fontSize: 22, marginRight: 8 }}>{g.giftEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {g.giftName} · from {g.fromName}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {new Date(g.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={{ color: colors.online, fontWeight: '900' }}>+{g.coins}</Text>
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
  statValue: { fontWeight: '900', fontSize: 20 },
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
