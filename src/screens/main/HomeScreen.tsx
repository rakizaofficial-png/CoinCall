import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import type { Host } from '../../types/models';
import { colors } from '../../theme/colors';

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function statusLabel(h: Host) {
  if (h.isOnCall) return `On call ${formatClock(h.currentCallSeconds)}`;
  if (h.isLive) return 'LIVE now';
  if (h.isOnline) return 'Waiting for calls';
  return 'Offline';
}

export function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const {
    filteredHosts,
    hostOnline,
    setHostOnline,
    setHomeFilter,
    homeFilter,
    refreshList,
    user,
    competition,
    myRank,
    myTodayMinutes,
    myLongestCallSeconds,
    workingHosts,
    liveHosts,
  } = useApp();

  const top3 = competition.slice(0, 3);
  const rival = competition.find((c) => !c.isMe && c.rank < myRank) ?? competition[0];
  const beatTarget = Math.max(0, (rival?.todayMinutes ?? myTodayMinutes + 5) - myTodayMinutes + 1);

  const filters: { key: typeof homeFilter; label: string }[] = [
    { key: 'working', label: 'Working' },
    { key: 'live', label: 'Live' },
    { key: 'online', label: 'Online' },
    { key: 'prime', label: 'VIP' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hi {user.name.split(' ')[0]} 💕</Text>
          <Text style={styles.title}>Host race</Text>
        </View>
        <Pressable
          style={[styles.onlineBtn, hostOnline ? styles.onlineOn : styles.onlineOff]}
          onPress={() => setHostOnline(!hostOnline)}
        >
          <View
            style={[styles.dot, { backgroundColor: hostOnline ? colors.online : colors.textMuted }]}
          />
          <Text style={styles.onlineText}>{hostOnline ? 'Online' : 'Offline'}</Text>
        </Pressable>
      </View>

      <LinearGradient colors={[colors.primary, colors.primarySoft]} style={styles.raceCard}>
        <Text style={styles.raceRank}>Your rank #{myRank}</Text>
        <Text style={styles.raceTitle}>
          {myRank === 1
            ? "You're #1 — keep the longest calls!"
            : `Beat ${rival?.name ?? 'top host'} · +${beatTarget} min`}
        </Text>
        <View style={styles.raceStats}>
          <View>
            <Text style={styles.raceStatValue}>{myTodayMinutes}m</Text>
            <Text style={styles.raceStatLabel}>Today</Text>
          </View>
          <View>
            <Text style={styles.raceStatValue}>{formatClock(myLongestCallSeconds)}</Text>
            <Text style={styles.raceStatLabel}>Longest</Text>
          </View>
          <View>
            <Text style={styles.raceStatValue}>{workingHosts.length}</Text>
            <Text style={styles.raceStatLabel}>Working</Text>
          </View>
          <View>
            <Text style={styles.raceStatValue}>{liveHosts.length}</Text>
            <Text style={styles.raceStatLabel}>Live</Text>
          </View>
        </View>
      </LinearGradient>

      <Text style={styles.section}>Today competition</Text>
      <View style={styles.podium}>
        {top3.map((entry) => (
          <View key={entry.id} style={[styles.podiumItem, entry.isMe && styles.podiumMe]}>
            <Text style={styles.podiumRank}>#{entry.rank}</Text>
            <Image source={{ uri: entry.avatarUrl }} style={styles.podiumAvatar} />
            <Text style={styles.podiumName} numberOfLines={1}>
              {entry.isMe ? 'You' : entry.name.split(' ')[0]}
            </Text>
            <Text style={styles.podiumMin}>{entry.todayMinutes}m</Text>
            {entry.isLive ? (
              <Text style={styles.podiumLive}>LIVE</Text>
            ) : entry.isOnCall ? (
              <Text style={styles.podiumCall}>CALL</Text>
            ) : null}
          </View>
        ))}
      </View>

      {!hostOnline ? (
        <LinearGradient colors={['#5A1638', '#2A1020']} style={styles.banner}>
          <Text style={styles.bannerTitle}>You're offline</Text>
          <Text style={styles.bannerSub}>Go Online to race other hosts and earn</Text>
          <Pressable style={styles.bannerBtn} onPress={() => setHostOnline(true)}>
            <Text style={styles.bannerBtnText}>Go Online</Text>
          </Pressable>
        </LinearGradient>
      ) : null}

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.chip, homeFilter === f.key && styles.chipOn]}
            onPress={() => setHomeFilter(f.key)}
          >
            <Text style={[styles.chipText, homeFilter === f.key && styles.chipTextOn]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.refresh} onPress={refreshList}>
          <Ionicons name="refresh" size={18} color={colors.blush} />
        </Pressable>
      </View>

      <Text style={styles.section}>Hosts working now</Text>

      <FlatList
        data={filteredHosts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 28 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No hosts here yet. Stay Online ✨</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('HostProfile', { hostId: item.id })}
          >
            <View>
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              {item.isOnline || item.isOnCall || item.isLive ? (
                <View
                  style={[
                    styles.onlineDot,
                    {
                      backgroundColor: item.isLive
                        ? colors.danger
                        : item.isOnCall
                          ? colors.accent
                          : colors.online,
                    },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.body}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{statusLabel(item)}</Text>
              <Text style={styles.comp}>
                {item.todayMinutes}m today · best {formatClock(item.longestCallSeconds)}
              </Text>
            </View>
            <Pressable
              style={[
                styles.callBtn,
                item.isLive && styles.liveBtn,
                item.isOnCall && styles.onCallBtn,
              ]}
              onPress={() => navigation.navigate('HostProfile', { hostId: item.id })}
            >
              <Ionicons
                name={item.isLive ? 'radio' : 'videocam'}
                size={16}
                color="#fff"
              />
              <Text style={styles.callText}>
                {item.isLive ? 'Watch' : item.isOnCall ? 'Race' : 'Call'}
              </Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  hello: { color: colors.textSecondary, fontSize: 14 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 2 },
  onlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  onlineOn: {
    backgroundColor: 'rgba(61,214,140,0.12)',
    borderColor: 'rgba(61,214,140,0.4)',
  },
  onlineOff: { backgroundColor: colors.bgCard, borderColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  raceCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
  },
  raceRank: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13 },
  raceTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 17,
    marginTop: 4,
    lineHeight: 22,
  },
  raceStats: {
    flexDirection: 'row',
    marginTop: 14,
    justifyContent: 'space-between',
  },
  raceStatValue: { color: '#fff', fontWeight: '800', fontSize: 18 },
  raceStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  section: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 10,
  },
  podium: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  podiumItem: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  podiumMe: {
    borderColor: colors.primarySoft,
    backgroundColor: 'rgba(232,90,140,0.15)',
  },
  podiumRank: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  podiumAvatar: { width: 40, height: 40, borderRadius: 20, marginTop: 6 },
  podiumName: { color: colors.text, fontWeight: '700', marginTop: 6, fontSize: 12 },
  podiumMin: { color: colors.blush, fontWeight: '800', marginTop: 2, fontSize: 13 },
  podiumLive: {
    marginTop: 4,
    color: colors.danger,
    fontWeight: '800',
    fontSize: 10,
  },
  podiumCall: {
    marginTop: 4,
    color: colors.accent,
    fontWeight: '800',
    fontSize: 10,
  },
  banner: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  bannerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  bannerSub: { color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  bannerBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  bannerBtnText: { color: colors.primary, fontWeight: '800' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: '#fff' },
  refresh: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.bgCard,
  },
  body: { flex: 1, marginLeft: 12 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.primarySoft, marginTop: 3, fontSize: 12, fontWeight: '700' },
  comp: { color: colors.textMuted, marginTop: 3, fontSize: 11 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  liveBtn: { backgroundColor: colors.danger },
  onCallBtn: { backgroundColor: '#C47A2C' },
  callText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: 24 },
});
