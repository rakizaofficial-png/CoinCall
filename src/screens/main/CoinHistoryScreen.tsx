import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HistoryFilters,
  HistoryPager,
  HistoryScreenHeader,
  HistoryTabs,
} from '../../components/ui/HistoryChrome';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import {
  fetchHostEarnings,
  type HostCallHistoryRow,
  type HostGiftHistoryRow,
} from '../../services/hostEarningsApi';
import { font } from '../../theme/fonts';
import { radii, spacing } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import type { Transaction } from '../../types/models';

type Tab = 'all' | 'earn' | 'spend' | 'payout';
type Range = 'all' | 'today' | 'week' | 'month';

type CoinRow = {
  id: string;
  label: string;
  amount: number;
  kind: 'earn' | 'spend' | 'payout';
  timestamp: number;
  meta?: string;
};

const PAGE_SIZE = 12;

function rangeStart(range: Range): number {
  const now = Date.now();
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === 'week') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === 'month') return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

function txKind(t: Transaction): CoinRow['kind'] {
  if (t.type === 'payout') return 'payout';
  if (t.type === 'spend') return 'spend';
  return 'earn';
}

export function CoinHistoryScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, transactions } = useApp();
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<Range>('all');
  const [page, setPage] = useState(1);
  const [calls, setCalls] = useState<HostCallHistoryRow[]>([]);
  const [gifts, setGifts] = useState<HostGiftHistoryRow[]>([]);

  const load = useCallback(async () => {
    if (!user.id) return;
    try {
      const data = await fetchHostEarnings(user.id);
      setCalls(data.calls || []);
      setGifts(data.gifts || []);
    } catch {
      setCalls([]);
      setGifts([]);
    }
  }, [user.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const rows = useMemo(() => {
    const fromTx: CoinRow[] = (transactions || []).map((t) => ({
      id: `tx_${t.id}`,
      label: t.label,
      amount: t.amount,
      kind: txKind(t),
      timestamp: t.timestamp,
    }));
    const fromCalls: CoinRow[] = calls.map((c) => ({
      id: `call_${c.id}`,
      label: `Call · ${c.userName || 'Caller'}`,
      amount: c.coinsSpent,
      kind: 'earn' as const,
      timestamp: c.endedAt || c.startedAt,
      meta: `${Math.max(1, Math.round(c.durationSec / 60))} min`,
    }));
    const fromGifts: CoinRow[] = gifts.map((g) => ({
      id: `gift_${g.id}`,
      label: `${g.giftEmoji || '🎁'} ${g.giftName} · ${g.fromName}`,
      amount: g.coins,
      kind: 'earn' as const,
      timestamp: g.createdAt,
    }));
    const start = rangeStart(range);
    return [...fromTx, ...fromCalls, ...fromGifts]
      .filter((r) => r.timestamp >= start)
      .filter((r) => (tab === 'all' ? true : r.kind === tab))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, calls, gifts, tab, range]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const net = rows.reduce((sum, r) => {
    if (r.kind === 'spend' || r.kind === 'payout') return sum - Math.abs(r.amount);
    return sum + Math.abs(r.amount);
  }, 0);

  return (
    <Screen contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}>
      <HistoryScreenHeader
        title="Coin History"
        subtitle={`${rows.length} entries · net ${net >= 0 ? '+' : ''}${net}`}
        onBack={() => navigation.goBack()}
      />
      <HistoryTabs
        options={[
          { key: 'all', label: 'All' },
          { key: 'earn', label: 'Earned' },
          { key: 'spend', label: 'Spent' },
          { key: 'payout', label: 'Payout' },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      />
      <HistoryFilters
        options={[
          { key: 'all', label: 'All time' },
          { key: 'today', label: 'Today' },
          { key: 'week', label: '7 days' },
          { key: 'month', label: '30 days' },
        ]}
        value={range}
        onChange={(v) => {
          setRange(v);
          setPage(1);
        }}
      />

      <FlatList
        data={pageRows}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 8, flexGrow: 1 }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No coin activity for this filter.
          </Text>
        }
        renderItem={({ item }) => {
          const positive = item.kind === 'earn';
          const sign = positive ? '+' : '−';
          return (
            <View
              style={[
                styles.row,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {new Date(item.timestamp).toLocaleString()}
                  {item.meta ? ` · ${item.meta}` : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.amount,
                  { color: positive ? colors.success : colors.danger },
                ]}
              >
                {sign}
                {Math.abs(item.amount)}
              </Text>
            </View>
          );
        }}
      />

      <HistoryPager
        page={safePage}
        pageCount={pageCount}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.medium,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: 8,
    gap: 10,
  },
  label: {
    fontFamily: font.semi,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 11,
    marginTop: 3,
  },
  amount: {
    fontFamily: font.bold,
    fontSize: 15,
    fontWeight: '700',
  },
});
