import { PlayCircle, Plus, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HostWorkspaceSwitcher } from '../../components/HostWorkspaceSwitcher';
import { PartyRoomHub } from '../../components/PartyRoomHub';
import { PkBattleArena } from '../../components/PkBattleArena';
import { Waiting1v1Panel } from '../../components/Waiting1v1Panel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { env } from '../../config/env';
import { useApp } from '../../context/AppContext';
import type { AppColors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const STORY_PREVIEWS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=320&fit=crop',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=320&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=320&fit=crop',
];

export function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    hostOnline,
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

  return (
    <LinearGradient
      colors={[colors.bg, colors.bgElevated, colors.bg]}
      style={[styles.container, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hi {user.name.split(' ')[0]}</Text>
          <Text style={styles.title}>Studio</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Earnings')} hitSlop={8}>
          <Text style={styles.walletLink}>{user.coinBalance} coins</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <HostWorkspaceSwitcher />

        {workspaceMode === 'waiting_1v1' || workspaceMode === 'solo_calling' ? (
          <Waiting1v1Panel />
        ) : null}
        {workspaceMode === 'pk_battle' ? <PkBattleArena /> : null}
        {workspaceMode === 'party_room' ? <PartyRoomHub /> : null}

        {workspaceMode === 'solo_calling' ? (
          <LinearGradient
            colors={[`${colors.primary}59`, colors.bgElevated]}
            style={styles.soloBanner}
          >
            <Text style={styles.soloTitle}>Solo Calling Mode</Text>
            <Text style={styles.soloSub}>
              1v1 session active · Party Room & PK paused until you hang up
            </Text>
          </LinearGradient>
        ) : null}

        <LinearGradient
          colors={[colors.bgCard, colors.bgSoft]}
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
            <Text style={styles.cashOutText}>Cash-Out</Text>
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

        {bridgeOk === null ? (
          <View style={{ marginBottom: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        <View style={styles.hubRow}>
          <Pressable
            style={styles.hubCard}
            onPress={() => {
              enterPkBattle();
              setWorkspaceMode('pk_battle');
            }}
          >
            <LinearGradient
              colors={[`${colors.primary}4D`, colors.bgElevated]}
              style={styles.hubGrad}
            >
              <Text style={styles.hubTitle}>PK Battle Arena</Text>
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
              colors={[`${colors.accent}40`, colors.bgElevated]}
              style={styles.hubGrad}
            >
              <Text style={styles.hubTitle}>Party Room Hub</Text>
              <Text style={styles.hubSub}>4–6 seat group stream</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <Pressable
          style={styles.coachCard}
          onPress={() =>
            notify(
              'Audio Coach',
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
              Tap for tips to attract more users
            </Text>
          </View>
          <PlayCircle size={28} color={colors.accent} />
        </Pressable>

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
            <Plus size={28} color={colors.accent} />
            <Text style={styles.storyAddText}>New</Text>
          </Pressable>
          {STORY_PREVIEWS.map((uri, i) => (
            <View key={uri} style={styles.storyThumbWrap}>
              <Image source={{ uri }} style={styles.storyThumb} />
              {i > 0 ? (
                <View style={styles.storyLock}>
                  <Lock size={14} color="#fff" />
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <LinearGradient
          colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
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
              <Image
                source={{ uri: entry.avatarUrl }}
                style={styles.podiumAvatar}
              />
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
      </ScrollView>
    </LinearGradient>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
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
    borderColor: `${colors.primary}80`,
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
    borderColor: colors.border,
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
    minHeight: 48,
    justifyContent: 'center',
  },
  cashOutText: { color: '#0B1220', fontWeight: '900', fontSize: 13 },
  cashOutSub: { color: '#1E293B', fontSize: 10, fontWeight: '700', marginTop: 2 },
  bridgeBanner: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  bridgeGood: {
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderColor: 'rgba(52,211,153,0.4)',
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
    borderColor: colors.border,
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
    borderColor: colors.border,
    minHeight: 64,
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
    backgroundColor: `${colors.primary}26`,
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
});
