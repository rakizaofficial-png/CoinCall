import {
  Bell,
  ChevronRight,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  Wallet,
  Wifi,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar } from '../../components/ui/Avatar';
import { GlassCard } from '../../components/ui/GlassCard';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function ProfileScreen({ navigation }: { navigation: any }) {
  const {
    user,
    beautyOn,
    runHostTool,
    hostOnline,
    setHostOnline,
    callsToday,
    myRank,
    myTodayMinutes,
  } = useApp();
  const { signOut, usingFirebase } = useAuth();
  const { colors, isDark, setScheme, preference } = useTheme();

  const cycleTheme = () => {
    if (preference === 'system') setScheme('dark');
    else if (preference === 'dark') setScheme('light');
    else setScheme('system');
  };

  const themeLabel =
    preference === 'system' ? 'System' : preference === 'dark' ? 'Dark' : 'Light';

  return (
    <Screen scroll contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <Avatar uri={user.avatarUrl} size={104} ring online={hostOnline} />
        <Text style={[styles.name, { color: colors.text }]}>{user.name}</Text>
        <Text style={[styles.badge, { color: colors.primarySoft }]}>
          HOST · Rank #{myRank}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          ID {user.hostId || '—'} · Lv {user.level} · {myTodayMinutes}m today
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {user.country || 'Country'} · {usingFirebase ? 'Cloud' : 'Demo'}
        </Text>
      </View>

      <GlassCard style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Wifi size={20} color={colors.online} />
            <Text style={[styles.rowTitle, { color: colors.text }]}>Available for calls</Text>
          </View>
          <Switch
            value={hostOnline}
            onValueChange={(v) => setHostOnline(v)}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable style={styles.row} onPress={() => runHostTool('beauty')}>
          <View style={styles.rowLeft}>
            <Sparkles size={20} color={colors.accent} />
            <View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Beauty filter</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                {beautyOn ? 'Glam on' : 'Tap to enable'}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.pill,
              {
                color: beautyOn ? colors.online : colors.textMuted,
                backgroundColor: beautyOn ? `${colors.online}22` : colors.bgElevated,
              },
            ]}
          >
            {beautyOn ? 'ON' : 'OFF'}
          </Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable style={styles.row} onPress={() => navigation.navigate('Earnings')}>
          <View style={styles.rowLeft}>
            <Wallet size={20} color={colors.primarySoft} />
            <View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Withdraw</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                {user.coinBalance} coins ready
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Settings</Text>
      <GlassCard style={{ paddingHorizontal: 4, paddingVertical: 4 }}>
        <Pressable style={styles.row} onPress={cycleTheme}>
          <View style={styles.rowLeft}>
            {isDark ? (
              <Moon size={20} color={colors.primarySoft} />
            ) : (
              <Sun size={20} color={colors.accent} />
            )}
            <View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Appearance</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                {themeLabel} mode
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('Notifications')}
          accessibilityRole="button"
        >
          <View style={styles.rowLeft}>
            <Bell size={20} color={colors.accent} />
            <View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Notifications</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                Call alerts & tips
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </GlassCard>

      <View style={styles.stats}>
        {[
          { v: callsToday, l: 'Calls' },
          { v: user.coinBalance, l: 'Coins' },
          { v: user.gems, l: 'Gems' },
        ].map((s) => (
          <View
            key={s.l}
            style={[
              styles.stat,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.statValue, { color: colors.blush }]}>{s.v}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.l}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.signOut, { borderColor: colors.danger }]}
        onPress={signOut}
        accessibilityRole="button"
      >
        <LogOut size={18} color={colors.danger} />
        <Text style={[styles.signOutText, { color: colors.danger }]}>Sign Out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: 20 },
  name: { fontSize: 26, fontWeight: '800', marginTop: 14 },
  badge: { marginTop: 8, fontWeight: '800', letterSpacing: 0.4, fontSize: 12 },
  meta: { marginTop: 6, fontSize: 13 },
  section: { fontWeight: '800', fontSize: 17, marginTop: 22, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { fontWeight: '700', fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  pill: {
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
    fontSize: 12,
  },
  stats: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: {
    flex: 1,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: { fontWeight: '800', fontSize: 18 },
  statLabel: { marginTop: 4, fontSize: 11 },
  signOut: {
    marginTop: 28,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
  },
  signOutText: { fontWeight: '800' },
});
