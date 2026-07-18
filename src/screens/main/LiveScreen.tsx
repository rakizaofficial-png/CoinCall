import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme/colors';

function formatLive(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function LiveScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const {
    myRoom,
    createMyRoom,
    startPartyLive,
    endPartyLive,
    partyLiveSeconds,
    hostEarnings,
    user,
    beautyOn,
    runHostTool,
    liveHosts,
    filteredRooms,
    joinRoom,
    competition,
    myRank,
  } = useApp();

  const liveRooms = filteredRooms.filter((r) => r.isLive);
  const liveRival = competition.find((c) => c.isLive && !c.isMe);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 36, paddingHorizontal: 16 }}
    >
      <Text style={styles.title}>Go Live</Text>
      <Text style={styles.subtitle}>
        Hosts see each other live — stay on to climb rank #{myRank}
      </Text>

      {liveRival ? (
        <View style={styles.nudge}>
          <Ionicons name="flame" size={18} color={colors.accent} />
          <Text style={styles.nudgeText}>
            {liveRival.name} is LIVE · {liveRival.todayMinutes}m today. Go live and beat her!
          </Text>
        </View>
      ) : null}

      <LinearGradient
        colors={myRoom?.isLive ? ['#5A1638', '#2A1020'] : ['#3A2030', '#24151E']}
        style={styles.card}
      >
        {!myRoom ? (
          <>
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarBig} />
            <Text style={styles.cardTitle}>Create your beauty room</Text>
            <Text style={styles.cardSub}>
              Other hosts will see you when you go live. Compete for gifts and minutes.
            </Text>
            <Pressable style={styles.primary} onPress={createMyRoom}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.primaryText}>Create Room</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.row}>
              <Image source={{ uri: myRoom.avatarUrl }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, styles.left]}>{myRoom.title}</Text>
                <Text style={[styles.cardSub, styles.left]}>
                  {myRoom.isLive
                    ? `LIVE ${formatLive(partyLiveSeconds)} · ${myRoom.viewers} watching`
                    : 'Ready — other hosts are waiting'}
                </Text>
              </View>
              {myRoom.isLive ? (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{myRoom.viewers}</Text>
                <Text style={styles.statLabel}>Viewers</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{hostEarnings.gift}</Text>
                <Text style={styles.statLabel}>Gifts</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{beautyOn ? 'ON' : 'OFF'}</Text>
                <Text style={styles.statLabel}>Beauty</Text>
              </View>
            </View>

            <Pressable style={styles.beautyBtn} onPress={() => runHostTool('beauty')}>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
              <Text style={styles.beautyText}>
                {beautyOn ? 'Beauty filter is ON' : 'Turn on beauty filter'}
              </Text>
            </Pressable>

            {!myRoom.isLive ? (
              <Pressable style={styles.primary} onPress={startPartyLive}>
                <Ionicons name="radio" size={20} color="#fff" />
                <Text style={styles.primaryText}>Go Live Now</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.endBtn} onPress={endPartyLive}>
                <Ionicons name="stop" size={20} color="#fff" />
                <Text style={styles.primaryText}>End Live</Text>
              </Pressable>
            )}
          </>
        )}
      </LinearGradient>

      <Text style={styles.section}>Hosts live now · {liveHosts.length}</Text>
      {liveHosts.length === 0 ? (
        <Text style={styles.empty}>No one live yet — be the first ✨</Text>
      ) : (
        liveHosts.map((h) => (
          <Pressable
            key={h.id}
            style={styles.hostRow}
            onPress={() => navigation?.navigate?.('HostProfile', { hostId: h.id })}
          >
            <Image source={{ uri: h.avatarUrl }} style={styles.hostAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hostName}>{h.name}</Text>
              <Text style={styles.hostMeta}>
                {h.todayMinutes}m today · best {formatLive(h.longestCallSeconds)}
              </Text>
            </View>
            <View style={styles.livePill}>
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          </Pressable>
        ))
      )}

      <Text style={styles.section}>Live rooms</Text>
      {liveRooms.length === 0 ? (
        <Text style={styles.empty}>Create your room and go live to show here.</Text>
      ) : (
        liveRooms.map((room) => (
          <Pressable key={room.id} style={styles.roomRow} onPress={() => joinRoom(room.id)}>
            <Image source={{ uri: room.avatarUrl }} style={styles.hostAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hostName}>{room.title}</Text>
              <Text style={styles.hostMeta}>
                {room.viewers} watching · {room.language}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))
      )}

      <Text style={styles.tip}>
        Tip: Long 1:1 calls on Calls tab + live gifts here = higher competition rank.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, marginTop: 6, marginBottom: 14, lineHeight: 20 },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,193,108,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,193,108,0.35)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  nudgeText: { flex: 1, color: colors.accent, fontWeight: '700', fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarBig: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 20,
    textAlign: 'center',
  },
  cardSub: {
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  left: { textAlign: 'left' },
  livePill: {
    backgroundColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  livePillText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  stats: {
    flexDirection: 'row',
    marginTop: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    paddingVertical: 12,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.blush, fontWeight: '800', fontSize: 18 },
  statLabel: { color: colors.textMuted, marginTop: 2, fontSize: 11 },
  beautyBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(245,193,108,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,193,108,0.35)',
  },
  beautyText: { color: colors.accent, fontWeight: '700' },
  primary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 15,
  },
  endBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.danger,
    borderRadius: 16,
    paddingVertical: 15,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  section: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 17,
    marginTop: 22,
    marginBottom: 10,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hostAvatar: { width: 48, height: 48, borderRadius: 24 },
  hostName: { color: colors.text, fontWeight: '800' },
  hostMeta: { color: colors.textMuted, marginTop: 3, fontSize: 12 },
  empty: { color: colors.textSecondary, marginBottom: 8 },
  tip: {
    marginTop: 18,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
