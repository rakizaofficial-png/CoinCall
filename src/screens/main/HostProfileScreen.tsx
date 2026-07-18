import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../../components/GradientButton';
import { useApp } from '../../context/AppContext';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { notify, promptChoices } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'HostProfile'>;

export function HostProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { getHost, startCall, blockUser, reportUser } = useApp();
  const host = getHost(route.params.hostId);

  if (!host) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.missing}>Host not found</Text>
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
    >
      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>

      <Image source={{ uri: host.avatarUrl }} style={styles.hero} />
      <Text style={styles.name}>{host.name}</Text>
      <View style={styles.metaRow}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: host.isLive
                ? colors.danger
                : host.isOnCall
                  ? colors.accent
                  : host.isOnline
                    ? colors.online
                    : colors.textMuted,
            },
          ]}
        />
        <Text style={styles.meta}>
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
      <Text style={styles.rate}>
        Competition · {host.todayMinutes}m today · best{' '}
        {Math.floor(host.longestCallSeconds / 60)}:
        {(host.longestCallSeconds % 60).toString().padStart(2, '0')}
      </Text>
      <Text style={styles.bio}>{host.bio}</Text>

      <View style={styles.compRow}>
        <View style={styles.compBox}>
          <Text style={styles.compValue}>{host.todayCoins}</Text>
          <Text style={styles.compLabel}>Coins today</Text>
        </View>
        <View style={styles.compBox}>
          <Text style={styles.compValue}>{host.totalCalls}</Text>
          <Text style={styles.compLabel}>Total calls</Text>
        </View>
        <View style={styles.compBox}>
          <Text style={styles.compValue}>Lv {host.level}</Text>
          <Text style={styles.compLabel}>Level</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photos}>
        {host.photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.photo} />
        ))}
      </ScrollView>

      <GradientButton
        label={host.isOnCall ? 'Race her · Longer call 💕' : 'Video Call & Earn 💕'}
        onPress={onCall}
        disabled={!host.isOnline}
      />

      <View style={styles.rowActions}>
        <Pressable
          style={styles.secondary}
          onPress={() => navigation.navigate('Chat', { hostId: host.id })}
        >
          <Text style={styles.secondaryText}>Message</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() =>
            promptChoices('Report', 'Choose a reason', [
              { label: 'Spam', onPress: () => reportUser(host.id, 'Spam') },
              { label: 'Abuse', onPress: () => reportUser(host.id, 'Abuse') },
            ])
          }
        >
          <Text style={styles.secondaryText}>Report</Text>
        </Pressable>
        <Pressable
          style={[styles.secondary, styles.danger]}
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
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  center: { alignItems: 'center', justifyContent: 'center' },
  missing: { color: colors.textSecondary },
  back: { marginBottom: 8, width: 36 },
  hero: {
    width: '100%',
    height: 280,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
  },
  name: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 16,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  meta: { color: colors.textSecondary },
  rate: { color: colors.primarySoft, fontWeight: '800', marginTop: 8, fontSize: 15 },
  bio: { color: colors.textSecondary, marginTop: 12, lineHeight: 22 },
  compRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  compBox: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  compValue: { color: colors.blush, fontWeight: '800', fontSize: 16 },
  compLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
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
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
  },
  danger: { borderColor: colors.danger },
  secondaryText: { color: colors.text, fontWeight: '700' },
});
