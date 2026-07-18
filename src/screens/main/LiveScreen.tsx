import { Flame, PlusCircle, Radio, Sparkles, StopCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../theme/ThemeContext';

function formatLive(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function LiveScreen({ navigation }: { navigation?: any }) {
  const { colors } = useTheme();
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
    <Screen scroll contentContainerStyle={{ paddingBottom: 110 }}>
      <Text style={[styles.title, { color: colors.text }]}>Go Live</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Create or join rooms · climb rank #{myRank}
      </Text>

      {liveRival ? (
        <View
          style={[
            styles.nudge,
            {
              backgroundColor: `${colors.accent}18`,
              borderColor: `${colors.accent}55`,
            },
          ]}
        >
          <Flame size={18} color={colors.accent} />
          <Text style={[styles.nudgeText, { color: colors.accent }]}>
            {liveRival.name} is LIVE · {liveRival.todayMinutes}m today. Go live and beat her!
          </Text>
        </View>
      ) : null}

      <LinearGradient
        colors={
          myRoom?.isLive
            ? [colors.gradientMid, colors.bgElevated]
            : [colors.bgCard, colors.bgSoft]
        }
        style={[styles.card, { borderColor: colors.border }]}
      >
        {!myRoom ? (
          <>
            <Image
              source={{ uri: user.avatarUrl }}
              style={[styles.avatarBig, { borderColor: colors.primarySoft }]}
            />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Create your room</Text>
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              Other hosts will see you when you go live.
            </Text>
            <Pressable
              style={[styles.primary, { backgroundColor: colors.primary }]}
              onPress={createMyRoom}
            >
              <PlusCircle size={20} color="#fff" />
              <Text style={styles.primaryText}>Create Room</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.row}>
              <Image
                source={{ uri: myRoom.avatarUrl }}
              style={[styles.avatar, { borderColor: colors.primarySoft }]}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, styles.left, { color: colors.text }]}>
                {myRoom.title}
              </Text>
                <Text style={[styles.cardSub, styles.left, { color: colors.textSecondary }]}>
                  {myRoom.isLive
                    ? `LIVE ${formatLive(partyLiveSeconds)} · ${myRoom.viewers} watching`
                    : 'Ready — other hosts are waiting'}
                </Text>
              </View>
              {myRoom.isLive ? (
                <View style={[styles.livePill, { backgroundColor: colors.danger }]}>
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.blush }]}>{myRoom.viewers}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Viewers</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.blush }]}>{hostEarnings.gift}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Gifts</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.blush }]}>
                  {beautyOn ? 'ON' : 'OFF'}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Beauty</Text>
              </View>
            </View>

            <Pressable
              style={[
                styles.beautyBtn,
                {
                  backgroundColor: `${colors.accent}14`,
                  borderColor: `${colors.accent}55`,
                },
              ]}
              onPress={() => runHostTool('beauty')}
            >
              <Sparkles size={18} color={colors.accent} />
              <Text style={[styles.beautyText, { color: colors.accent }]}>
                {beautyOn ? 'Beauty filter is ON' : 'Turn on beauty filter'}
              </Text>
            </Pressable>

            {!myRoom.isLive ? (
              <Pressable
                style={[styles.primary, { backgroundColor: colors.primary }]}
                onPress={startPartyLive}
              >
                <Radio size={20} color="#fff" />
                <Text style={styles.primaryText}>Go Live Now</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.endBtn, { backgroundColor: colors.danger }]}
                onPress={endPartyLive}
              >
                <StopCircle size={20} color="#fff" />
                <Text style={styles.primaryText}>End Live</Text>
              </Pressable>
            )}
          </>
        )}
      </LinearGradient>

      <Text style={[styles.section, { color: colors.text }]}>
        Hosts live now · {liveHosts.length}
      </Text>
      {liveHosts.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No one live yet — be the first</Text>
      ) : (
        liveHosts.map((h) => (
          <Pressable
            key={h.id}
            style={[
              styles.hostRow,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
            onPress={() => navigation?.navigate?.('HostProfile', { hostId: h.id })}
          >
            <Image source={{ uri: h.avatarUrl }} style={styles.hostAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.hostName, { color: colors.text }]}>{h.name}</Text>
              <Text style={[styles.hostMeta, { color: colors.textMuted }]}>
                {h.todayMinutes}m today · best {formatLive(h.longestCallSeconds)}
              </Text>
            </View>
            <View style={[styles.livePill, { backgroundColor: colors.danger }]}>
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          </Pressable>
        ))
      )}

      <Text style={[styles.section, { color: colors.text }]}>Live rooms · Join</Text>
      {liveRooms.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>
          Create your room and go live to show here.
        </Text>
      ) : (
        liveRooms.map((room) => (
          <Pressable
            key={room.id}
            style={[
              styles.roomRow,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
            onPress={() => joinRoom(room.id)}
          >
            <Image source={{ uri: room.avatarUrl }} style={styles.hostAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.hostName, { color: colors.text }]}>{room.title}</Text>
              <Text style={[styles.hostMeta, { color: colors.textMuted }]}>
                {room.viewers} watching · {room.language}
              </Text>
            </View>
          </Pressable>
        ))
      )}

      <Text style={[styles.tip, { color: colors.textMuted }]}>
        Tip: Long 1:1 calls + live gifts = higher competition rank.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 6, marginBottom: 14, lineHeight: 20 },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  nudgeText: { flex: 1, fontWeight: '700', fontSize: 13, lineHeight: 18 },
  card: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarBig: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    marginBottom: 12,
    borderWidth: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
  },
  cardTitle: {
    fontWeight: '800',
    fontSize: 20,
    textAlign: 'center',
  },
  cardSub: {
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  left: { textAlign: 'left' },
  livePill: {
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
  statValue: { fontWeight: '800', fontSize: 18 },
  statLabel: { marginTop: 2, fontSize: 11 },
  beautyBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  beautyText: { fontWeight: '700' },
  primary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
    minHeight: 52,
  },
  endBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
    minHeight: 52,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  section: {
    fontWeight: '800',
    fontSize: 17,
    marginTop: 22,
    marginBottom: 10,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  hostAvatar: { width: 48, height: 48, borderRadius: 24 },
  hostName: { fontWeight: '800' },
  hostMeta: { marginTop: 3, fontSize: 12 },
  tip: {
    marginTop: 18,
    textAlign: 'center',
    lineHeight: 20,
  },
});
