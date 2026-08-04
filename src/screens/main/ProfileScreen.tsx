import { LinearGradient } from 'expo-linear-gradient';
import {
  BadgeCheck,
  Bell,
  ChevronRight,
  Coins,
  Headphones,
  History,
  Info,
  LogOut,
  Phone,
  Pencil,
  Settings,
  Star,
  Users,
  Wallet,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { font } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type SummaryCard = {
  key: string;
  label: string;
  value: string | number;
  icon: typeof Coins;
  onPress?: () => void;
  accent?: string;
};

export function ProfileScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, hostOnline, hostLifetime, hostEarnings, myRank, callsToday } =
    useApp();
  const { myLiveRoom, todayLiveGiftCoins } = useLiveStudio();
  const { signOut, user: authUser } = useAuth();

  const wallet = Math.max(user.coinBalance, hostLifetime.walletBalance || 0);
  const earned =
    hostLifetime.coinsEarned ||
    hostEarnings.call +
      Math.max(hostEarnings.gift, todayLiveGiftCoins) +
      hostEarnings.task +
      hostEarnings.invite;
  const rating = Number((user as { rating?: number }).rating || 4.9).toFixed(1);
  const calls = Math.max(hostLifetime.totalCalls || 0, callsToday || 0);
  const liveStatus = myLiveRoom?.isLive
    ? 'Live'
    : hostOnline
      ? 'Online'
      : 'Offline';
  const liveColor = myLiveRoom?.isLive
    ? '#E11D48'
    : hostOnline
      ? colors.success
      : colors.textMuted;
  const profileFields = [
    user.name,
    user.avatarUrl,
    user.bio,
    user.country,
    user.languages?.length,
    user.categories?.length,
  ];
  const profileCompletion = Math.round(
    (profileFields.filter(Boolean).length / profileFields.length) * 100,
  );

  const cards: SummaryCard[] = [
    {
      key: 'balance',
      label: 'Balance',
      value: wallet,
      icon: Wallet,
      onPress: () => navigation.navigate('Earnings'),
      accent: colors.accent,
    },
    {
      key: 'coins',
      label: 'Total earned',
      value: earned,
      icon: Coins,
      onPress: () => navigation.navigate('CoinHistory'),
      accent: colors.cyberGold,
    },
    {
      key: 'calls',
      label: 'Calls',
      value: calls,
      icon: Phone,
      onPress: () => navigation.navigate('CallHistory'),
      accent: colors.primarySoft,
    },
    {
      key: 'followers',
      label: 'Followers',
      value: hostLifetime.followers || 0,
      icon: Users,
      accent: colors.blush,
    },
  ];

  const menuGroups = [
    {
      title: 'Activity',
      items: [
        {
          key: 'coinHistory',
          label: 'Coin history',
          hint: 'See every coin received and spent',
          icon: History,
          screen: 'CoinHistory' as const,
        },
        {
          key: 'callHistory',
          label: 'Call history',
          hint: 'Completed, missed and declined calls',
          icon: Phone,
          screen: 'CallHistory' as const,
        },
      ],
    },
    {
      title: 'Earnings',
      items: [
        {
          key: 'earnings',
          label: 'Earnings overview',
          hint: 'Calls, gifts and other income',
          icon: Wallet,
          screen: 'Earnings' as const,
        },
        {
          key: 'withdraw',
          label: 'Withdraw funds',
          hint: 'Transfer your available balance',
          icon: Coins,
          screen: 'Withdraw' as const,
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          key: 'help',
          label: 'Help & support',
          hint: 'Get help with your account',
          icon: Headphones,
          screen: 'HelpCenter' as const,
        },
        {
          key: 'system',
          label: 'App information',
          hint: 'Version, device and service status',
          icon: Info,
          screen: 'SystemInformation' as const,
        },
        {
          key: 'settings',
          label: 'Settings',
          hint: 'Notifications, privacy and preferences',
          icon: Settings,
          screen: 'Settings' as const,
        },
      ],
    },
  ];

  return (
    <Screen
      tabBar
      scroll
      skipTopInset
      contentContainerStyle={{ paddingTop: 0, paddingBottom: 12 }}
    >
      <Animated.View entering={FadeInDown.springify().damping(18)} style={{ flex: 1 }}>
        <LinearGradient
          colors={[`${colors.primary}66`, `${colors.accent}22`, colors.bg]}
          style={[styles.hero, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.topRow}>
            <View style={[styles.statusDot, { backgroundColor: liveColor }]}>
              <Text style={styles.statusText}>{liveStatus}</Text>
            </View>
            <View style={styles.topActions}>
              <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={10}>
                <Bell size={20} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}>
                <Settings size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <Pressable onPress={() => navigation.navigate('EditHostProfile')} style={styles.identity}>
            <View>
              <Avatar uri={user.avatarUrl} size={72} ring online={hostOnline} />
              <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
                <Pencil size={12} color="#fff" />
              </View>
            </View>
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {user.name || 'Host'}
                </Text>
                {user.isVerified || authUser?.isVerified ? (
                  <BadgeCheck size={18} color={colors.accent} />
                ) : null}
              </View>
              <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                ID {user.hostId || user.appId || '—'}
                {user.country ? ` · ${user.country}` : ''}
              </Text>
              <Text style={[styles.bio, { color: colors.textMuted }]} numberOfLines={2}>
                {user.bio?.trim() || 'Tap to edit your profile'}
              </Text>
            </View>
          </Pressable>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Star size={14} color="#FACC15" />
              <Text style={styles.heroStatValue}>{rating}</Text>
              <Text style={styles.heroStatLabel}>Rating</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <BadgeCheck size={14} color="#67E8F9" />
              <Text style={styles.heroStatValue}>#{myRank || '—'}</Text>
              <Text style={styles.heroStatLabel}>Rank</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Users size={14} color="#F9A8D4" />
              <Text style={styles.heroStatValue}>
                {hostLifetime.followers || 0}
              </Text>
              <Text style={styles.heroStatLabel}>Followers</Text>
            </View>
          </View>
        </LinearGradient>

        <Pressable
          onPress={() => navigation.navigate('EditHostProfile')}
          style={[
            styles.completionCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <View style={[styles.completionIcon, { backgroundColor: `${colors.primary}20` }]}>
            <Pencil size={17} color={colors.primarySoft} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.completionTitle, { color: colors.text }]}>
              Public profile
            </Text>
            <Text style={[styles.completionHint, { color: colors.textMuted }]}>
              {profileCompletion}% complete · Tap to update photos and details
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${profileCompletion}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          Overview
        </Text>
        <View style={styles.grid}>
          {cards.map((c) => (
            <Pressable
              key={c.key}
              onPress={c.onPress}
              disabled={!c.onPress}
              style={[
                styles.card,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
              ]}
            >
              <View style={[styles.cardIcon, { backgroundColor: `${c.accent || colors.primary}22` }]}>
                <c.icon size={16} color={c.accent || colors.primary} />
              </View>
              <Text style={[styles.cardValue, { color: colors.text }]} numberOfLines={1}>
                {c.value}
              </Text>
              <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        {menuGroups.map((group) => (
          <View key={group.title}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {group.title}
            </Text>
            <View
              style={[
                styles.menu,
                { backgroundColor: colors.bgElevated, borderColor: colors.border },
              ]}
            >
              {group.items.map((l, i) => (
                <Pressable
                  key={l.key}
                  onPress={() => navigation.navigate(l.screen)}
                  style={[
                    styles.menuRow,
                    i < group.items.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <l.icon size={17} color={colors.primarySoft} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: colors.text }]}>{l.label}</Text>
                    <Text style={[styles.menuHint, { color: colors.textMuted }]}>{l.hint}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          style={[styles.signOut, { borderColor: colors.danger }]}
          onPress={signOut}
        >
          <LogOut size={16} color={colors.danger} />
          <Text style={{ color: colors.danger, fontFamily: font.bold, fontWeight: '700' }}>
            Sign Out
          </Text>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statusDot: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  statusText: {
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 11,
    fontWeight: '700',
  },
  topActions: { flexDirection: 'row', gap: 14 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0b0b0f',
  },
  identityText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.title, fontSize: 20 },
  meta: { ...typography.caption, fontFamily: font.medium },
  bio: { ...typography.caption, fontFamily: font.regular, marginTop: 2, lineHeight: 16 },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  heroStatValue: {
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 13,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: font.medium,
    fontSize: 10,
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  completionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: spacing.md,
  },
  completionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionTitle: {
    fontFamily: font.bold,
    fontSize: 14,
    fontWeight: '800',
  },
  completionHint: {
    fontFamily: font.regular,
    fontSize: 11,
    marginTop: 2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: { height: 4, borderRadius: 2 },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.md,
  },
  card: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    maxWidth: '49%',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  cardValue: {
    fontFamily: font.bold,
    fontSize: 16,
    fontWeight: '700',
  },
  cardLabel: {
    fontFamily: font.medium,
    fontSize: 11,
  },
  menu: {
    borderWidth: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 52,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: font.semi,
    fontSize: 14,
    fontWeight: '600',
  },
  menuHint: {
    fontFamily: font.regular,
    fontSize: 11,
    marginTop: 1,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
});
