import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { notify } from '../../utils/notify';

export function HostPendingScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut, approveCurrentHost } = useAuth();

  const onApproveDemo = async () => {
    try {
      await approveCurrentHost();
      notify('Approved ✨', 'Your host ID is approved. Welcome to CoinCall Beauty!');
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not approve');
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.card}>
        {user?.photoUrl || user?.avatarUrl ? (
          <Image source={{ uri: user.photoUrl || user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Ionicons name="person" size={36} color={colors.textMuted} />
          </View>
        )}

        <Text style={styles.title}>Waiting for approval</Text>
        <Text style={styles.sub}>
          Admin is reviewing your picture, video, name and country. The hosting app stays locked
          until your Host ID is approved.
        </Text>

        <View style={styles.idBox}>
          <Text style={styles.idLabel}>Your Host ID</Text>
          <Text style={styles.idValue}>{user?.hostId || '—'}</Text>
        </View>

        <View style={styles.meta}>
          <Text style={styles.metaLine}>Name · {user?.name}</Text>
          <Text style={styles.metaLine}>Country · {user?.country || '—'}</Text>
          <Text style={styles.metaLine}>
            Photos · {user?.photoUrls?.length || (user?.photoUrl ? 1 : 0)} uploaded
          </Text>
          <Text style={styles.metaLine}>Video · {user?.videoUrl ? 'Uploaded ✓' : 'Missing'}</Text>
          <Text style={styles.metaLine}>Status · Pending review</Text>
        </View>

        <View style={styles.waitRow}>
          <Ionicons name="time" size={18} color={colors.accent} />
          <Text style={styles.waitText}>Usually reviewed within 24 hours</Text>
        </View>

        <Pressable style={styles.approveBtn} onPress={onApproveDemo}>
          <Text style={styles.approveText}>Approve Host ID (admin demo)</Text>
        </Pressable>

        <Pressable style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.primarySoft,
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  sub: {
    color: colors.textSecondary,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 21,
  },
  idBox: {
    marginTop: 20,
    backgroundColor: 'rgba(232,90,140,0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primarySoft,
    width: '100%',
  },
  idLabel: { color: colors.textSecondary, fontWeight: '600', fontSize: 12 },
  idValue: {
    color: colors.blush,
    fontWeight: '800',
    fontSize: 28,
    marginTop: 4,
    letterSpacing: 1,
  },
  meta: { alignSelf: 'stretch', marginTop: 18, gap: 6 },
  metaLine: { color: colors.textSecondary, fontSize: 14 },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  waitText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  approveBtn: {
    marginTop: 22,
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  approveText: { color: '#fff', fontWeight: '800' },
  signOut: { marginTop: 16 },
  signOutText: { color: colors.textMuted, fontWeight: '700' },
});
