import { ChevronLeft } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../../components/GradientButton';
import { useApp } from '../../context/AppContext';
import type { RootStackParamList } from '../../navigation/types';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify, promptChoices } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'HostProfile'>;

export function HostProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getHost, startCall, blockUser, reportUser } = useApp();
  const host = getHost(route.params.hostId);

  if (!host) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.bg },
        ]}
      >
        <Text style={{ color: colors.textSecondary }}>Host not found</Text>
      </View>
    );
  }

  const onCall = () => {
    const result = startCall(host.id);
    if (!result.ok) {
      notify('Cannot start call', result.message);
      return;
    }
    navigation.navigate('Call', { hostId: host.id });
  };

  const statusColor = host.isLive
    ? colors.danger
    : host.isOnCall
      ? colors.accent
      : host.isOnline
        ? colors.online
        : colors.textMuted;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: 40,
        paddingHorizontal: 16,
      }}
    >
      <Pressable
        style={styles.back}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
      >
        <ChevronLeft size={28} color={colors.text} />
      </Pressable>

      <Image source={{ uri: host.avatarUrl }} style={styles.hero} />
      <Text style={[styles.name, { color: colors.text }]}>{host.name}</Text>
      <View style={styles.metaRow}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={{ color: colors.textSecondary }}>
          {host.isLive
            ? 'LIVE now'
            : host.isOnCall
              ? 'On a long call'
              : host.isOnline
                ? 'Online'
                : 'Offline'}{' '}
          · {host.country} · ★ {host.rating}
        </Text>
      </View>
      <Text style={[styles.rate, { color: colors.primarySoft }]}>
        Competition · {host.todayMinutes}m today · best{' '}
        {Math.floor(host.longestCallSeconds / 60)}:
        {(host.longestCallSeconds % 60).toString().padStart(2, '0')}
      </Text>
      <Text style={[styles.bio, { color: colors.textSecondary }]}>{host.bio}</Text>

      <View style={styles.compRow}>
        {[
          { v: host.todayCoins, l: 'Coins today' },
          { v: host.totalCalls, l: 'Total calls' },
          { v: `Lv ${host.level}`, l: 'Level' },
        ].map((c) => (
          <View
            key={c.l}
            style={[
              styles.compBox,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.compValue, { color: colors.blush }]}>{c.v}</Text>
            <Text style={[styles.compLabel, { color: colors.textMuted }]}>{c.l}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photos}>
        {host.photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.photo} />
        ))}
      </ScrollView>

      <GradientButton
        label={host.isOnCall ? 'Race her · Longer call' : 'Video Call & Earn'}
        onPress={onCall}
        disabled={!host.isOnline}
      />

      <View style={styles.rowActions}>
        <Pressable
          style={[
            styles.secondary,
            { borderColor: colors.border, backgroundColor: colors.bgCard },
          ]}
          onPress={() => navigation.navigate('Chat', { hostId: host.id })}
        >
          <Text style={[styles.secondaryText, { color: colors.text }]}>Message</Text>
        </Pressable>
        <Pressable
          style={[
            styles.secondary,
            { borderColor: colors.border, backgroundColor: colors.bgCard },
          ]}
          onPress={() =>
            promptChoices('Report', 'Choose a reason', [
              { label: 'Spam', onPress: () => reportUser(host.id, 'Spam') },
              { label: 'Abuse', onPress: () => reportUser(host.id, 'Abuse') },
            ])
          }
        >
          <Text style={[styles.secondaryText, { color: colors.text }]}>Report</Text>
        </Pressable>
        <Pressable
          style={[
            styles.secondary,
            { borderColor: colors.danger, backgroundColor: colors.bgCard },
          ]}
          onPress={() => {
            blockUser(host.id);
            navigation.goBack();
          }}
        >
          <Text style={[styles.secondaryText, { color: colors.danger }]}>Block</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { marginBottom: 8, width: 44, height: 44, justifyContent: 'center' },
  hero: {
    width: '100%',
    height: 280,
    borderRadius: radii.lg,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 16,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rate: { fontWeight: '800', marginTop: 8, fontSize: 15 },
  bio: { marginTop: 12, lineHeight: 22 },
  compRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  compBox: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  compValue: { fontWeight: '800', fontSize: 16 },
  compLabel: { fontSize: 11, marginTop: 4 },
  photos: { marginVertical: 16 },
  photo: {
    width: 110,
    height: 140,
    borderRadius: 14,
    marginRight: 10,
  },
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondary: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryText: { fontWeight: '700' },
});
