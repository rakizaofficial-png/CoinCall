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
  formatDuration,
  type HostCallHistoryRow,
} from '../../services/hostEarningsApi';
import {
  listLiveCallHistory,
  type LiveCallHistoryRow,
} from '../../services/liveCallHistory';
import { font } from '../../theme/fonts';
import { radii, spacing } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type Tab = 'all' | 'completed' | 'missed' | 'rejected';
type Range = 'all' | 'today' | 'week' | 'month';

type CallRow = {
  id: string;
  name: string;
  status: string;
  timestamp: number;
  durationSec: number;
  coins: number;
  fromLive?: boolean;
  country?: string;
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

function normalizeStatus(raw: string): Tab | 'other' {
  const s = (raw || '').toLowerCase();
  if (s.includes('complete') || s === 'ended' || s === 'ok') return 'completed';
  if (s.includes('miss') || s === 'timeout' || s === 'no_answer') return 'missed';
  if (s.includes('reject') || s === 'declined' || s === 'busy') return 'rejected';
  if (s === 'failed') return 'missed';
  return 'other';
}

function fromApi(c: HostCallHistoryRow): CallRow {
  return {
    id: `api_${c.id}`,
    name: c.userName || 'Caller',
    status: c.status || c.endReason || 'completed',
    timestamp: c.endedAt || c.startedAt,
    durationSec: c.durationSec || 0,
    coins: c.coinsSpent || 0,
  };
}

function fromLive(c: LiveCallHistoryRow): CallRow {
  return {
    id: `live_${c.id}`,
    name: c.userName || 'Caller',
    status: c.status,
    timestamp: c.endTime || c.startTime,
    durationSec: c.durationSec || 0,
    coins: c.coinsEarned || 0,
    fromLive: c.fromLive,
    country: c.country,
  };
}

export function CallHistoryScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const [tab, setTab] = useState<Tab>('all');
  const [range, setRange] = useState<Range>('all');
  const [page, setPage] = useState(1);
  const [rowsRaw, setRowsRaw] = useState<CallRow[]>([]);

  const load = useCallback(async () => {
    if (!user.id) return;
    try {
      const [earnings, live] = await Promise.all([
        fetchHostEarnings(user.id).catch(() => null),
        listLiveCallHistory(200),
      ]);
      const apiRows = (earnings?.calls || []).map(fromApi);
      const liveRows = live.map(fromLive);
      const seen = new Set<string>();
      const merged: CallRow[] = [];
      for (const r of [...liveRows, ...apiRows]) {
        const key = `${r.name}_${r.timestamp}_${r.durationSec}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }
      setRowsRaw(merged.sort((a, b) => b.timestamp - a.timestamp));
    } catch {
      setRowsRaw([]);
    }
  }, [user.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const rows = useMemo(() => {
    const start = rangeStart(range);
    return rowsRaw
      .filter((r) => r.timestamp >= start)
      .filter((r) => {
        if (tab === 'all') return true;
        return normalizeStatus(r.status) === tab;
      });
  }, [rowsRaw, tab, range]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const totalCoins = rows.reduce((s, r) => s + (r.coins || 0), 0);

  return (
    <Screen contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}>
      <HistoryScreenHeader
        title="Call History"
        subtitle={`${rows.length} calls · ${totalCoins} coins`}
        onBack={() => navigation.goBack()}
      />
      <HistoryTabs
        options={[
          { key: 'all', label: 'All' },
          { key: 'completed', label: 'Done' },
          { key: 'missed', label: 'Missed' },
          { key: 'rejected', label: 'Reject' },
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
            No calls for this filter.
          </Text>
        }
        renderItem={({ item }) => {
          const bucket = normalizeStatus(item.status);
          const statusColor =
            bucket === 'completed'
              ? colors.success
              : bucket === 'rejected'
                ? colors.danger
                : colors.textMuted;
          return (
            <View
              style={[
                styles.row,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                  {item.country ? ` · ${item.country}` : ''}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {new Date(item.timestamp).toLocaleString()}
                  {' · '}
                  {formatDuration(item.durationSec)}
                  {item.fromLive ? ' · from Live' : ''}
                </Text>
                <Text style={[styles.status, { color: statusColor }]}>
                  {(item.status || 'completed').replace(/_/g, ' ')}
                </Text>
              </View>
              <Text style={[styles.coins, { color: colors.success }]}>
                +{item.coins || 0}
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
  name: {
    fontFamily: font.semi,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 11,
    marginTop: 3,
  },
  status: {
    fontFamily: font.semi,
    fontSize: 11,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  coins: {
    fontFamily: font.bold,
    fontSize: 15,
    fontWeight: '700',
  },
});
