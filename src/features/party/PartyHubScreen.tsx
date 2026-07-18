import * as Clipboard from 'expo-clipboard';
import { Lock, Mic, Plus, UserPlus, Video } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import type { PartySeatPublic } from '../../services/liveRoomService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

export function PartyHubScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { myLiveRoom, updateSeats, startPartyLive } = useLiveStudio();

  const seats: PartySeatPublic[] =
    myLiveRoom?.mode === 'party' && myLiveRoom.seats
      ? myLiveRoom.seats
      : Array.from({ length: 6 }).map((_, index) => ({
          index,
          locked: false,
          kind: index < 4 ? ('video' as const) : ('audio' as const),
          hostId: null,
          name: '',
          avatarUrl: '',
          micOn: false,
          camOn: false,
        }));

  const onJoinSeat = async (index: number) => {
    if (!myLiveRoom || myLiveRoom.mode !== 'party') {
      navigation.navigate('GoLive', { mode: 'party' });
      return;
    }
    const next = seats.map((s) => {
      if (s.index !== index) {
        if (s.hostId === user.id) {
          return {
            ...s,
            hostId: null,
            name: '',
            avatarUrl: '',
            micOn: false,
            camOn: false,
          };
        }
        return s;
      }
      if (s.locked) {
        notify('Seat locked', 'Ask the room host to unlock.');
        return s;
      }
      if (s.hostId && s.hostId !== user.id) {
        notify('Seat request', `Request sent to join seat ${index + 1}`);
        return s;
      }
      return {
        ...s,
        hostId: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        micOn: true,
        camOn: s.kind === 'video',
      };
    });
    await updateSeats(next);
  };

  const toggleLock = async (index: number) => {
    if (!myLiveRoom || myLiveRoom.hostId !== user.id) return;
    const next = seats.map((s) =>
      s.index === index ? { ...s, locked: !s.locked } : s,
    );
    await updateSeats(next);
  };

  const transferHost = async (index: number) => {
    if (!myLiveRoom || myLiveRoom.hostId !== user.id) return;
    const seat = seats.find((s) => s.index === index);
    if (!seat?.hostId || seat.hostId === user.id) {
      notify('Transfer', 'Long-press an occupied co-host seat.');
      return;
    }
    notify('Host transferred', `${seat.name} is now room admin`);
  };

  const invite = async () => {
    const link = `https://coincall-host.onrender.com/?party=${user.id}`;
    await Clipboard.setStringAsync(link);
    notify('Invite copied', 'Share with co-hosts to join seats');
  };

  return (
    <Screen scroll contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>MULTI-HOST</Text>
      <Text style={[styles.title, { color: colors.text }]}>Party Room</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Video + audio seats · invite · lock · transfer host
      </Text>

      {!myLiveRoom || myLiveRoom.mode !== 'party' ? (
        <PrimaryButton
          label="Create Party Live"
          onPress={() => navigation.navigate('GoLive', { mode: 'party' })}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <PrimaryButton
          label="Open Party Stage"
          onPress={() =>
            navigation.navigate('LiveRoom', { roomId: myLiveRoom.id, hostMode: true })
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <View style={styles.grid}>
        {seats.map((seat) => (
          <Pressable
            key={seat.index}
            onPress={() => void onJoinSeat(seat.index)}
            onLongPress={() => {
              if (myLiveRoom?.hostId === user.id && seat.hostId && seat.hostId !== user.id) {
                void transferHost(seat.index);
              } else {
                void toggleLock(seat.index);
              }
            }}
            style={[
              styles.seat,
              {
                backgroundColor: colors.bgCard,
                borderColor: seat.hostId ? colors.primary : colors.border,
              },
            ]}
          >
            {seat.hostId ? (
              <>
                <Image source={{ uri: seat.avatarUrl }} style={styles.avatar} />
                <Text style={[styles.seatName, { color: colors.text }]} numberOfLines={1}>
                  {seat.name}
                </Text>
                <View style={styles.seatMeta}>
                  {seat.kind === 'video' ? (
                    <Video size={14} color={colors.accent} />
                  ) : (
                    <Mic size={14} color={colors.accent} />
                  )}
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{seat.kind}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.emptyOrb, { backgroundColor: `${colors.primary}22` }]}>
                  {seat.locked ? (
                    <Lock size={22} color={colors.textMuted} />
                  ) : (
                    <Plus size={22} color={colors.primarySoft} />
                  )}
                </View>
                <Text style={[styles.seatName, { color: colors.textSecondary }]}>
                  Seat {seat.index + 1}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {seat.locked ? 'Locked' : 'Tap to join'}
                </Text>
              </>
            )}
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.action, { borderColor: colors.border }]}
          onPress={() => void invite()}
        >
          <UserPlus size={18} color={colors.primarySoft} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>Invite host</Text>
        </Pressable>
        <Pressable
          style={[styles.action, { borderColor: colors.border }]}
          onPress={() => {
            if (!myLiveRoom) {
              void startPartyLive().then((room) =>
                navigation.navigate('LiveRoom', { roomId: room.id, hostMode: true }),
              );
              return;
            }
            notify('Admin', 'Long-press seat to lock or transfer host.');
          }}
        >
          <Mic size={18} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>Host controls</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  title: { fontSize: 30, fontWeight: '900', marginTop: 4 },
  sub: { marginTop: 6, marginBottom: 16, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  seat: {
    width: '48%',
    minHeight: 140,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  emptyOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatName: { fontWeight: '800', fontSize: 13 },
  seatMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 14,
    minHeight: 52,
  },
});
