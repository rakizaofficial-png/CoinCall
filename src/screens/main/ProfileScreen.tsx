import { LinearGradient } from 'expo-linear-gradient';
import {
  BadgeCheck,
  Bell,
  Building2,
  ChevronRight,
  Coins,
  Headphones,
  Info,
  Languages,
  LogOut,
  Pencil,
  Radio,
  Settings,
  Star,
  Users,
  Wallet,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
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
    hostLifetime,
    hostEarnings,
    myRank,
  } = useApp();
  const { myLiveRoom, todayLiveGiftCoins } = useLiveStudio();
  const { signOut, user: authUser } = useAuth();

  const languages = user.languages?.length ? user.languages : ['English'];
  const bioText =
    user.bio?.trim() || 'Add a short bio so fans know who you are.';
  const agency =
    (user as { agencyName?: string }).agencyName ||
    (authUser as { agencyName?: string } | null)?.agencyName ||
    'Independent';
  const wallet = Math.max(user.coinBalance, hostLifetime.walletBalance || 0);
  const earned =
    hostLifetime.coinsEarned ||
    hostEarnings.call +
      Math.max(hostEarnings.gift, todayLiveGiftCoins) +
      hostEarnings.task +
      hostEarnings.invite;
  const rating = Number((user as { rating?: number }).rating || 4.9).toFixed(1);
  const liveStatus = myLiveRoom?.isLive
    ? 'Live now'
    : hostOnline
      ? 'Online · ready'
      : 'Offline';
  const verification =
    user.isVerified || authUser?.isVerified ? 'Verified host' : 'Pending verification';

  const openEdit = () => navigation.navigate('EditHostProfile');

  return (
    <Screen tabBar scroll skipTopInset contentContainerStyle={{ paddingTop: 0 }}>
      <Animated.View entering={FadeInDown.springify().damping(18)}>
      <LinearGradient
        colors={[`${colors.primary}88`, `${colors.accent}33`, colors.bg]}
        style={[styles.heroBg, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.topActions}>
          <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={10}>
            <Bell size={22} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}>
            <Settings size={22} color={colors.text} />
          </Pressable>
        </View>

        <Pressable onPress={openEdit} style={styles.avatarWrap}>
          <Avatar uri={user.avatarUrl} size={118} ring online={hostOnline} />
          <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
            <Pencil size={14} color="#fff" />
          </View>
        </Pressable>

        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]}>{user.name || 'Host'}</Text>
          {user.isVerified ? <BadgeCheck size={22} color={colors.accent} /> : null}
        </View>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          ID {user.hostId || user.appId || '—'}
          {user.country ? ` · ${user.country}` : ''}
        </Text>
        <Text style={[styles.bio, { color: colors.textSecondary }]}>{bioText}</Text>

        <View style={styles.liveRow}>
          <View
            style={[
              styles.liveChip,
              {
                backgroundColor: myLiveRoom?.isLive
                  ? '#E11D48'
                  : hostOnline
                    ? `${colors.success || '#22C55E'}55`
                    : 'rgba(255,255,255,0.1)',
              },
            ]}
          >
            <Radio size={12} color="#fff" />
            <Text style={styles.liveChipText}>{liveStatus}</Text>
          </View>
          <View style={[styles.liveChip, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <BadgeCheck size={12} color={colors.accent} />
            <Text style={styles.liveChipText}>{verification}</Text>
          </View>
        </View>

        <PrimaryButton
          label="Edit profile"
          onPress={openEdit}
          style={{ marginTop: 14, alignSelf: 'stretch', marginHorizontal: 8 }}
        />
      </LinearGradient>
      </Animated.View>

      <View style={styles.stats}>
        {[
          { label: 'Coins', value: wallet, icon: Coins },
          { label: 'Earnings', value: earned, icon: Wallet },
          { label: 'Followers', value: hostLifetime.followers || 0, icon: Users },
          { label: 'Rating', value: rating, icon: Star },
        ].map((s) => (
          <Pressable
            key={s.label}
            style={styles.stat}
            onPress={() => {
              if (s.label === 'Coins' || s.label === 'Earnings') {
                navigation.navigate('Earnings');
              }
            }}
          >
            <s.icon size={14} color={colors.primarySoft} />
            <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

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

      <Text style={[styles.section, { color: colors.text }]}>Agency</Text>
      <GlassCard>
        <View style={styles.row}>
          <Building2 size={20} color={colors.primarySoft} />
          <Text style={[styles.rowText, { color: colors.text }]}>{agency}</Text>
          <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Rank #{myRank}</Text>
        </View>
      </GlassCard>

      <GlassCard style={{ marginTop: 12 }}>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Earnings')}>
          <Wallet size={20} color={colors.accent} />
          <Text style={[styles.rowText, { color: colors.text }]}>Coins & earnings</Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Withdraw')}>
          <Coins size={20} color={colors.primarySoft} />
          <Text style={[styles.rowText, { color: colors.text }]}>Withdraw</Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('SystemInformation')}>
          <Info size={20} color={colors.textSecondary} />
          <Text style={[styles.rowText, { color: colors.text }]}>System information</Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('HelpCenter')}>
          <Headphones size={20} color={colors.primarySoft} />
          <Text style={[styles.rowText, { color: colors.text }]}>Help Center</Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Settings')}>
          <Settings size={20} color={colors.textSecondary} />
          <Text style={[styles.rowText, { color: colors.text }]}>Settings</Text>
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
    paddingBottom: 20,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginBottom: 8,
  },
  avatarWrap: { position: 'relative' },
  editBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0b0b0f',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  name: { fontSize: 26, fontWeight: '900' },
  meta: { marginTop: 4, fontSize: 13, fontWeight: '600' },
  bio: {
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 21,
    paddingHorizontal: 18,
    fontSize: 14,
  },
  liveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  liveChipText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  stat: { alignItems: 'center', flex: 1, gap: 4 },
  statValue: { fontWeight: '900', fontSize: 16 },
  statLabel: { fontSize: 11 },
  section: { fontWeight: '900', fontSize: 17, marginTop: 8, marginBottom: 10 },
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
