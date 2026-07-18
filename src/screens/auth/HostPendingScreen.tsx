import { Clock, User } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

export function HostPendingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, signOut, approveCurrentHost } = useAuth();

  const onApproveDemo = async () => {
    try {
      await approveCurrentHost();
      notify('Approved', 'Your host ID is approved. Welcome to CoinCall!');
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not approve');
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <GlassCard style={styles.card}>
        {user?.photoUrl || user?.avatarUrl ? (
          <Image
            source={{ uri: user.photoUrl || user.avatarUrl }}
            style={[styles.avatar, { borderColor: colors.primarySoft }]}
          />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarEmpty,
              {
                borderColor: colors.primarySoft,
                backgroundColor: colors.bgElevated,
              },
            ]}
          >
            <User size={36} color={colors.textMuted} />
          </View>
        )}

        <Text style={[styles.title, { color: colors.text }]}>Waiting for approval</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Admin is reviewing your picture, video, name and country. The hosting app stays locked
          until your Host ID is approved.
        </Text>

        <View
          style={[
            styles.idBox,
            {
              backgroundColor: `${colors.primary}22`,
              borderColor: colors.primarySoft,
            },
          ]}
        >
          <Text style={[styles.idLabel, { color: colors.textSecondary }]}>Your Host ID</Text>
          <Text style={[styles.idValue, { color: colors.blush }]}>
            {user?.hostId || '—'}
          </Text>
        </View>

        <View style={styles.meta}>
          <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
            Name · {user?.name}
          </Text>
          <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
            Country · {user?.country || '—'}
          </Text>
          <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
            Photos · {user?.photoUrls?.length || (user?.photoUrl ? 1 : 0)} uploaded
          </Text>
          <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
            Video · {user?.videoUrl ? 'Uploaded' : 'Missing'}
          </Text>
          <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
            Status · Pending review
          </Text>
        </View>

        <View style={styles.waitRow}>
          <Clock size={18} color={colors.accent} />
          <Text style={[styles.waitText, { color: colors.accent }]}>
            Usually reviewed within 24 hours
          </Text>
        </View>

        {__DEV__ ? (
          <PrimaryButton
            label="Approve Host ID (admin demo)"
            onPress={onApproveDemo}
            style={{ marginTop: 22, width: '100%' }}
          />
        ) : (
          <Text
            style={[
              styles.waitText,
              { color: colors.textMuted, marginTop: 18, textAlign: 'center' },
            ]}
          >
            Approval is handled by CoinCall admin. Keep this app open after approval.
          </Text>
        )}

        <Pressable style={styles.signOut} onPress={signOut} accessibilityRole="button">
          <Text style={[styles.signOutText, { color: colors.textMuted }]}>Sign out</Text>
        </Pressable>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  card: {
    padding: 22,
    alignItems: 'center',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  sub: {
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 21,
  },
  idBox: {
    marginTop: 20,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
  },
  idLabel: { fontWeight: '600', fontSize: 12 },
  idValue: {
    fontWeight: '800',
    fontSize: 28,
    marginTop: 4,
    letterSpacing: 1,
  },
  meta: { alignSelf: 'stretch', marginTop: 18, gap: 6 },
  metaLine: { fontSize: 14 },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  waitText: { fontWeight: '700', fontSize: 13 },
  signOut: { marginTop: 16, minHeight: 44, justifyContent: 'center' },
  signOutText: { fontWeight: '700', textAlign: 'center' },
});
