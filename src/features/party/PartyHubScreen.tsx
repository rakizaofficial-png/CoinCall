import * as Clipboard from 'expo-clipboard';
import { MessageSquare, Mic, Plus, Radio, UserPlus, Video } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HostChatSection } from '../../components/HostChatSection';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify, promptText } from '../../utils/notify';

export function PartyHubScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { myLiveRoom, startPartyLive, renameRoom, massTextAllActive, contactAdminSupport } =
    useLiveStudio();

  const isPartyLive = Boolean(myLiveRoom?.isLive && myLiveRoom.mode === 'party');

  const invite = async () => {
    const link = `https://coincall-host.onrender.com/?party=${user.id}`;
    await Clipboard.setStringAsync(link);
    notify('Invite copied', 'Share with users to join your party');
  };

  return (
    <Screen scroll contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>PARTY ROOM</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        {isPartyLive ? myLiveRoom!.title : 'Party Room'}
      </Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Host chat with users · room chat · mass text
      </Text>

      {!isPartyLive ? (
        <PrimaryButton
          label="Start Party Live"
          onPress={() => navigation.navigate('GoLive', { mode: 'party' })}
          style={{ marginBottom: 12 }}
        />
      ) : (
        <PrimaryButton
          label="Open Party Stage"
          onPress={() =>
            navigation.navigate('LiveRoom', { roomId: myLiveRoom!.id, hostMode: true })
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.action, { borderColor: colors.border }]}
          onPress={() => void invite()}
        >
          <UserPlus size={18} color={colors.primarySoft} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>Invite</Text>
        </Pressable>
        <Pressable
          style={[styles.action, { borderColor: colors.border }]}
          onPress={() => {
            if (!isPartyLive) {
              notify('Rename', 'Start party live first');
              return;
            }
            promptText(
              'Party name',
              'Change party room name',
              (title) => void renameRoom(title),
              myLiveRoom?.title || '',
            );
          }}
        >
          <Radio size={18} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>Rename</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.action, { borderColor: colors.border }]}
          onPress={() =>
            promptText('Mass text', 'Message active users only', (msg) => {
              void massTextAllActive(msg);
            })
          }
        >
          <MessageSquare size={18} color={colors.primarySoft} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>Mass text</Text>
        </Pressable>
        <Pressable
          style={[styles.action, { borderColor: colors.border }]}
          onPress={() =>
            promptText('Admin support', 'Create support ticket', (msg) => {
              void contactAdminSupport(msg);
            })
          }
        >
          <Plus size={18} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: '700' }}>Support</Text>
        </Pressable>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Chat section</Text>
      <HostChatSection />

      {isPartyLive && myLiveRoom?.seats ? (
        <>
          <Text style={[styles.section, { color: colors.text }]}>Seats</Text>
          <View style={styles.grid}>
            {myLiveRoom.seats.map((seat) => (
              <View
                key={seat.index}
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
                    </View>
                  </>
                ) : (
                  <Text style={{ color: colors.textMuted }}>Seat {seat.index + 1}</Text>
                )}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  title: { fontSize: 30, fontWeight: '900', marginTop: 4 },
  sub: { marginTop: 6, marginBottom: 16, lineHeight: 20 },
  section: { fontWeight: '900', fontSize: 16, marginTop: 18, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  seat: {
    width: '48%',
    minHeight: 110,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  seatName: { fontWeight: '800', fontSize: 13 },
  seatMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
