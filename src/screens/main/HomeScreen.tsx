import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HostWorkspaceSwitcher } from '../../components/HostWorkspaceSwitcher';
import { PartyRoomHub } from '../../components/PartyRoomHub';
import { PkBattleArena } from '../../components/PkBattleArena';
import { Waiting1v1Panel } from '../../components/Waiting1v1Panel';
import { env } from '../../config/env';
import { useApp } from '../../context/AppContext';
import type { Host } from '../../types/models';
import { colors } from '../../theme/colors';
import { notify } from '../../utils/notify';

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

const STORY_PREVIEWS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=320&fit=crop',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=320&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=320&fit=crop',
];

export function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const {
    filteredHosts,
    hostOnline,
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
    hostEarnings,
    requestPayout,
    workspaceMode,
    setWorkspaceMode,
    enterPkBattle,
    enterPartyRoom,
    hostPresenceStatus,
  } = useApp();
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  const [listed, setListed] = useState(0);

  const todayEarn =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    hostEarnings.managed;
  const localCash = Math.round(todayEarn * 2.5);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const base =
          env.apiBaseUrl.replace(/\/$/, '') ||
          'https://coincall-api.onrender.com/api';
        const health = await fetch(`${base.replace(/\/api$/, '')}/api/health`);
        const hostsRes = await fetch(`${base}/hosts`);
        const hostsJson = (await hostsRes.json()) as {
          hosts?: { id: string }[];
        };
        if (cancelled) return;
        const hosts = hostsJson.hosts || [];
        setListed(hosts.length);
        const meVisible = hosts.some((h) => h.id === user.id);
        setBridgeOk(health.ok && (!hostOnline || meVisible));
      } catch {
        if (!cancelled) setBridgeOk(false);
      }
    };
    void check();
    const t = setInterval(() => void check(), 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [hostOnline, user.id]);

  const top3 = competition.slice(0, 3);
  const rival =
    competition.find((c) => !c.isMe && c.rank < myRank) ?? competition[0];
  const beatTarget = Math.max(
    0,
    (rival?.todayMinutes ?? myTodayMinutes + 5) - myTodayMinutes + 1,
  );

  const filters: { key: typeof homeFilter; label: string }[] = [
    { key: 'working', label: 'Working' },
    { key: 'live', label: 'Live' },
    { key: 'online', label: 'Online' },
    { key: 'prime', label: 'VIP' },
  ];

  const ListHeader = (
    <View>
      <HostWorkspaceSwitcher />

      {workspaceMode === 'waiting_1v1' || workspaceMode === 'solo_calling' ? (
        <Waiting1v1Panel />
      ) : null}
      {workspaceMode === 'pk_battle' ? <PkBattleArena /> : null}
      {workspaceMode === 'party_room' ? <PartyRoomHub /> : null}

      {workspaceMode === 'solo_calling' ? (
        <LinearGradient
          colors={['rgba(255,42,122,0.35)', 'rgba(21,16,38,0.95)']}
          style={styles.soloBanner}
        >
          <Text style={styles.soloTitle}>Solo Calling Mode</Text>
          <Text style={styles.soloSub}>
            1v1 session active · Party Room & PK paused until you hang up
          </Text>
        </LinearGradient>
      ) : null}

      {/* Earnings + EasyPaisa cash-out */}
      <LinearGradient
        colors={['#1a1020', '#2a1830']}
        style={styles.earnHeader}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.earnLabel}>Today earnings</Text>
          <Text style={styles.earnGold}>Rs. {localCash.toLocaleString()}</Text>
          <Text style={styles.earnCoins}>
            {todayEarn} coins · status {hostPresenceStatus}
          </Text>
        </View>
        <Pressable style={styles.cashOutBtn} onPress={requestPayout}>
          <Text style={styles.cashOutText}>💸 Cash-Out</Text>
          <Text style={styles.cashOutSub}>EasyPaisa</Text>
        </Pressable>
      </LinearGradient>

      <View
        style={[
          styles.bridgeBanner,
          bridgeOk === false
            ? styles.bridgeBad
            : bridgeOk
              ? styles.bridgeGood
              : styles.bridgeWait,
        ]}
      >
        <Text style={styles.bridgeText}>
          {bridgeOk === false
            ? 'Not visible on Luma — go Online from 1v1 Wait'
            : bridgeOk
              ? `Visible on Luma · ${listed} host(s) listed`
              : 'Connecting to Luma bridge…'}
        </Text>
      </View>

      {/* Quick launch downtime hubs */}
      <View style={styles.hubRow}>
        <Pressable
          style={styles.hubCard}
          onPress={() => {
            enterPkBattle();
            setWorkspaceMode('pk_battle');
          }}
        >
          <LinearGradient
            colors={['rgba(255,42,122,0.3)', '#151026']}
            style={styles.hubGrad}
          >
            <Text style={styles.hubTitle}>🔥 PK Battle Arena</Text>
            <Text style={styles.hubSub}>Pink vs Blue · live points</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          style={styles.hubCard}
          onPress={() => {
            enterPartyRoom();
            setWorkspaceMode('party_room');
          }}
        >
          <LinearGradient
            colors={['rgba(255,184,0,0.25)', '#151026']}
            style={styles.hubGrad}
          >
            <Text style={styles.hubTitle}>🎉 Party Room Hub</Text>
            <Text style={styles.hubSub}>4–6 seat group stream</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Audio Coach */}
      <Pressable
        style={styles.coachCard}
        onPress={() =>
          notify(
            'Audio Coach 🎙️',
            'Smile to camera, say hi in 3 seconds, keep energy high — users stay longer.',
          )
        }
      >
        <View style={styles.coachWave}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.coachBar, { height: 8 + ((i * 7) % 18) }]}
            />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.coachTitle}>Audio Coach</Text>
          <Text style={styles.coachSub}>
            Tap to hear how to attract more users right now
          </Text>
        </View>
        <Ionicons name="play-circle" size={28} color={colors.accent} />
      </Pressable>

      {/* Story reel creator */}
      <Text style={styles.section}>Quick Story Reels · 15s teasers</Text>
      <View style={styles.storyRow}>
        <Pressable
          style={styles.storyAdd}
          onPress={() =>
            notify(
              'Story upload',
              '15s teaser clip ready — premium lock applied.',
            )
          }
        >
          <Ionicons name="add" size={28} color={colors.accent} />
          <Text style={styles.storyAddText}>New</Text>
        </Pressable>
        {STORY_PREVIEWS.map((uri, i) => (
          <View key={uri} style={styles.storyThumbWrap}>
            <Image source={{ uri }} style={styles.storyThumb} />
            {i > 0 ? (
              <View style={styles.storyLock}>
                <Ionicons name="lock-closed" size={14} color="#fff" />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <LinearGradient
        colors={[colors.primary, colors.primarySoft]}
        style={styles.raceCard}
      >
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
            <Text style={styles.raceStatValue}>
              {formatClock(myLongestCallSeconds)}
            </Text>
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
          <View
            key={entry.id}
            style={[styles.podiumItem, entry.isMe && styles.podiumMe]}
          >
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

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.chip, homeFilter === f.key && styles.chipOn]}
            onPress={() => setHomeFilter(f.key)}
          >
            <Text
              style={[styles.chipText, homeFilter === f.key && styles.chipTextOn]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.refresh} onPress={refreshList}>
          <Ionicons name="refresh" size={18} color={colors.blush} />
        </Pressable>
      </View>

      <Text style={styles.section}>Hosts working now</Text>
    </View>
  );

  return (
    <LinearGradient
      colors={['#0b0813', '#151026', '#0b0813']}
      style={[styles.container, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hi {user.name.split(' ')[0]}</Text>
          <Text style={styles.title}>Host HQ</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Earnings')}>
          <Text style={styles.walletLink}>{user.coinBalance} 🪙</Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredHosts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 28 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No hosts here yet. Go Live to Earn ✨</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              navigation.navigate('HostProfile', { hostId: item.id })
            }
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
                {item.todayMinutes}m today · best{' '}
                {formatClock(item.longestCallSeconds)}
              </Text>
            </View>
            <Pressable
              style={[
                styles.callBtn,
                item.isLive && styles.liveBtn,
                item.isOnCall && styles.onCallBtn,
              ]}
              onPress={() =>
                navigation.navigate('HostProfile', { hostId: item.id })
              }
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  hello: { color: colors.textSecondary, fontSize: 14 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 2 },
  walletLink: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  soloBanner: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,42,122,0.5)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  soloTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  soloSub: { color: colors.textSecondary, marginTop: 4, fontSize: 12 },
  earnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.35)',
    shadowColor: '#ffb800',
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  earnLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  earnGold: {
    color: colors.cyberGold,
    fontSize: 32,
    fontWeight: '900',
    marginTop: 2,
  },
  earnCoins: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  cashOutBtn: {
    backgroundColor: colors.cyberGold,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#ffb800',
    shadowOpacity: 0.55,
    shadowRadius: 10,
  },
  cashOutText: { color: '#1a1020', fontWeight: '900', fontSize: 13 },
  cashOutSub: { color: '#3a2810', fontSize: 10, fontWeight: '700', marginTop: 2 },
  bridgeBanner: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  bridgeGood: {
    backgroundColor: 'rgba(61,214,140,0.12)',
    borderColor: 'rgba(61,214,140,0.4)',
  },
  bridgeBad: {
    backgroundColor: 'rgba(255,80,80,0.12)',
    borderColor: 'rgba(255,80,80,0.35)',
  },
  bridgeWait: {
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
  },
  bridgeText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  hubRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  hubCard: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,42,122,0.35)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  hubGrad: { padding: 14, minHeight: 88, justifyContent: 'center' },
  hubTitle: { color: '#fff', fontWeight: '900', fontSize: 14 },
  hubSub: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  coachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.35)',
    shadowColor: '#ffb800',
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  coachWave: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    width: 36,
    height: 28,
  },
  coachBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  coachTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  coachSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  storyRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  storyAdd: {
    width: 72,
    height: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
  },
  storyAddText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 11,
    marginTop: 4,
  },
  storyThumbWrap: { position: 'relative' },
  storyThumb: { width: 72, height: 110, borderRadius: 14 },
  storyLock: {
    position: 'absolute',
    right: 6,
    top: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    padding: 4,
  },
  raceCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.45,
    shadowRadius: 14,
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
    backgroundColor: 'rgba(255,42,122,0.15)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  podiumRank: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  podiumAvatar: { width: 40, height: 40, borderRadius: 20, marginTop: 6 },
  podiumName: {
    color: colors.text,
    fontWeight: '700',
    marginTop: 6,
    fontSize: 12,
  },
  podiumMin: {
    color: colors.blush,
    fontWeight: '800',
    marginTop: 2,
    fontSize: 13,
  },
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
    borderColor: 'rgba(255,42,122,0.25)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.2,
    shadowRadius: 8,
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
  meta: {
    color: colors.primarySoft,
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
  },
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
