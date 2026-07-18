import { LinearGradient } from 'expo-linear-gradient';
import {
  BadgeCheck,
  Bell,
  ChevronRight,
  Crown,
  Languages,
  LogOut,
  Settings,
  Sparkles,
  Wallet,
} from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
import { GlassCard } from '../../components/ui/GlassCard';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function ProfileScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const {
    user,
    hostOnline,
    callsToday,
    myRank,
    myTodayMinutes,
    beautyOn,
    runHostTool,
    blockedIds,
  } = useApp();
  const { todayLiveGiftCoins, liveSeconds } = useLiveStudio();
  const { signOut } = useAuth();

  const gallery =
    user.photoUrls?.length
      ? user.photoUrls
      : [user.avatarUrl, user.photoUrl || user.avatarUrl].filter(Boolean);

  const languages = ['English', 'Arabic', 'Urdu'];
  const categories = ['Beauty', 'Chat', 'Lifestyle'];

  return (
    <Screen
      scroll
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}
    >
      <LinearGradient
        colors={[`${colors.primary}55`, colors.bg, colors.bg]}
        style={styles.heroBg}
      >
        <View style={styles.topActions}>
          <Pressable onPress={() => navigation.navigate('Notifications')}>
            <Bell size={22} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')}>
            <Settings size={22} color={colors.text} />
          </Pressable>
        </View>
        <Avatar uri={user.avatarUrl} size={110} ring online={hostOnline} />
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]}>{user.name}</Text>
          {user.isVerified ? <BadgeCheck size={22} color={colors.accent} /> : null}
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: `${colors.primary}44` }]}>
            <Text style={styles.badgeText}>Lv {user.level}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${colors.accent}44` }]}>
            <Crown size={12} color="#F5C14C" />
            <Text style={styles.badgeText}>VIP Host</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={styles.badgeText}>Rank #{myRank}</Text>
          </View>
        </View>
        <Text style={[styles.bio, { color: colors.textSecondary }]}>
          Professional live host · {user.country || 'Worldwide'} · ID{' '}
          {user.hostId || '—'}
        </Text>
      </LinearGradient>

      <View style={styles.stats}>
        {[
          { label: 'Followers', value: 1200 + callsToday * 3 },
          { label: 'Visitors', value: 340 + Math.floor(liveSeconds / 10) },
          { label: 'Gifts', value: todayLiveGiftCoins },
          { label: 'Minutes', value: myTodayMinutes },
        ].map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Gallery</Text>
      <View style={styles.gallery}>
        {gallery.slice(0, 6).map((uri, i) => (
          <Image key={`${uri}_${i}`} source={{ uri }} style={styles.gImg} />
        ))}
      </View>

      {user.videoUrl ? (
        <>
          <Text style={[styles.section, { color: colors.text }]}>Intro video</Text>
          <GlassCard>
            <Text style={{ color: colors.textSecondary }}>Video linked</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
              {user.videoUrl}
            </Text>
          </GlassCard>
        </>
      ) : null}

      <Text style={[styles.section, { color: colors.text }]}>Languages</Text>
      <View style={styles.chips}>
        {languages.map((l) => (
          <View
            key={l}
            style={[styles.chip, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          >
            <Languages size={14} color={colors.primarySoft} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{l}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Categories</Text>
      <View style={styles.chips}>
        {categories.map((c) => (
          <View
            key={c}
            style={[styles.chip, { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{c}</Text>
          </View>
        ))}
      </View>

      <GlassCard style={{ marginTop: 8 }}>
        <Pressable style={styles.row} onPress={() => runHostTool('beauty')}>
          <Sparkles size={20} color={colors.accent} />
          <Text style={[styles.rowText, { color: colors.text }]}>
            Beauty filter · {beautyOn ? 'On' : 'Off'}
          </Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Withdraw')}>
          <Wallet size={20} color={colors.primarySoft} />
          <Text style={[styles.rowText, { color: colors.text }]}>Wallet & withdraw</Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Settings')}>
          <Settings size={20} color={colors.textSecondary} />
          <Text style={[styles.rowText, { color: colors.text }]}>
            Settings · {blockedIds.length} blocked
          </Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
      </GlassCard>

      <Pressable
        style={[styles.signOut, { borderColor: colors.danger }]}
        onPress={signOut}
      >
        <LogOut size={18} color={colors.danger} />
        <Text style={{ color: colors.danger, fontWeight: '800' }}>Sign Out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroBg: {
    alignItems: 'center',
    paddingBottom: 16,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  topActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginBottom: 8,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  name: { fontSize: 26, fontWeight: '900' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bio: { textAlign: 'center', marginTop: 10, lineHeight: 20, paddingHorizontal: 12 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontWeight: '900', fontSize: 18 },
  statLabel: { fontSize: 11, marginTop: 2 },
  section: { fontWeight: '900', fontSize: 17, marginBottom: 10, marginTop: 8 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  gImg: { width: '31%', aspectRatio: 1, borderRadius: radii.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 6,
  },
  rowText: { flex: 1, fontWeight: '700' },
  signOut: {
    marginTop: 24,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
});
