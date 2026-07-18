import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export function ProfileScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { user, beautyOn, runHostTool, hostOnline, setHostOnline, callsToday, myRank, myTodayMinutes } = useApp();
  const { signOut, usingFirebase } = useAuth();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: 16 }}
    >
      <View style={styles.header}>
        <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.badge}>HOST · Beauty Creator · Rank #{myRank}</Text>
        <Text style={styles.meta}>
          ID {user.hostId || '—'} · Level {user.level} · {myTodayMinutes}m today
        </Text>
        <Text style={styles.meta}>
          {user.country || 'Country'} · {usingFirebase ? 'Cloud account' : 'Demo account'}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="radio" size={20} color={colors.online} />
            <Text style={styles.rowTitle}>Available for calls</Text>
          </View>
          <Switch
            value={hostOnline}
            onValueChange={(v) => setHostOnline(v)}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.divider} />

        <Pressable style={styles.row} onPress={() => runHostTool('beauty')}>
          <View style={styles.rowLeft}>
            <Ionicons name="sparkles" size={20} color={colors.accent} />
            <View>
              <Text style={styles.rowTitle}>Beauty filter</Text>
              <Text style={styles.rowSub}>{beautyOn ? 'Looking glam ✨' : 'Tap to turn on'}</Text>
            </View>
          </View>
          <Text style={[styles.pill, beautyOn && styles.pillOn]}>{beautyOn ? 'ON' : 'OFF'}</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.row} onPress={() => navigation.navigate('Earnings')}>
          <View style={styles.rowLeft}>
            <Ionicons name="wallet" size={20} color={colors.primarySoft} />
            <View>
              <Text style={styles.rowTitle}>Withdraw earnings</Text>
              <Text style={styles.rowSub}>{user.coinBalance} coins ready</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{callsToday}</Text>
          <Text style={styles.statLabel}>Calls</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{user.coinBalance}</Text>
          <Text style={styles.statLabel}>Coins</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{user.gems}</Text>
          <Text style={styles.statLabel}>Gems</Text>
        </View>
      </View>

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.primarySoft,
  },
  name: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 12 },
  badge: {
    marginTop: 8,
    color: colors.primarySoft,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  meta: { color: colors.textSecondary, marginTop: 6 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border },
  pill: {
    color: colors.textMuted,
    fontWeight: '800',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  pillOn: { color: colors.online, backgroundColor: 'rgba(61,214,140,0.15)' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { color: colors.blush, fontWeight: '800', fontSize: 18 },
  statLabel: { color: colors.textMuted, marginTop: 4, fontSize: 11 },
  signOut: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: colors.danger, fontWeight: '800' },
});
