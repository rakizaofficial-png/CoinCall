import { ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BadgeCheck,
  Bell,
  ChevronRight,
  Crown,
  Languages,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Video as VideoIcon,
  Wallet,
} from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
    callsToday,
    myRank,
    myTodayMinutes,
    beautyOn,
    runHostTool,
    blockedIds,
  } = useApp();
  const { todayLiveGiftCoins, liveSeconds } = useLiveStudio();
  const { signOut } = useAuth();

  const gallery = (
    user.photoUrls?.length
      ? user.photoUrls
      : [user.avatarUrl, user.photoUrl || user.avatarUrl].filter(Boolean)
  ).filter((uri): uri is string => Boolean(uri));

  const languages =
    user.languages?.length ? user.languages : ['English'];
  const categories =
    user.categories?.length ? user.categories : ['Talk'];
  const bioText =
    user.bio?.trim() ||
    'Add a short bio so fans know who you are.';

  const openEdit = () => navigation.navigate('EditHostProfile');

  return (
    <Screen
      scroll
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}
    >
      <LinearGradient
        colors={[`${colors.primary}66`, `${colors.accent}22`, colors.bg]}
        style={styles.heroBg}
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
          {hostOnline ? ' · Online' : ' · Offline'}
        </Text>

        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: `${colors.primary}55` }]}>
            <Text style={styles.badgeText}>Lv {user.level || 1}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${colors.accent}44` }]}>
            <Crown size={12} color="#F5C14C" />
            <Text style={styles.badgeText}>Host</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={styles.badgeText}>Rank #{myRank}</Text>
          </View>
        </View>

        <Text style={[styles.bio, { color: colors.textSecondary }]}>{bioText}</Text>

        <PrimaryButton
          label="Edit profile"
          onPress={openEdit}
          style={{ marginTop: 14, alignSelf: 'stretch', marginHorizontal: 24 }}
        />
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

      <View style={styles.sectionHead}>
        <Text style={[styles.section, { color: colors.text }]}>Gallery</Text>
        <Pressable onPress={openEdit} style={styles.sectionLink}>
          <Plus size={14} color={colors.primarySoft} />
          <Text style={{ color: colors.primarySoft, fontWeight: '800', fontSize: 12 }}>
            Add photos
          </Text>
        </Pressable>
      </View>
      <View style={styles.gallery}>
        {gallery.length === 0 ? (
          <Pressable
            onPress={openEdit}
            style={[
              styles.emptyCard,
              { borderColor: colors.border, backgroundColor: colors.bgCard },
            ]}
          >
            <Plus size={22} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontWeight: '700', marginTop: 6 }}>
              Upload profile photos
            </Text>
          </Pressable>
        ) : (
          gallery.slice(0, 6).map((uri, i) => (
            <Pressable key={`${uri}_${i}`} onPress={openEdit} style={styles.gImgWrap}>
              <Image source={{ uri }} style={styles.gImg} resizeMode="cover" />
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.section, { color: colors.text }]}>Intro video</Text>
        <Pressable onPress={openEdit} style={styles.sectionLink}>
          <VideoIcon size={14} color={colors.primarySoft} />
          <Text style={{ color: colors.primarySoft, fontWeight: '800', fontSize: 12 }}>
            {user.videoUrl ? 'Change' : 'Upload'}
          </Text>
        </Pressable>
      </View>
      {user.videoUrl ? (
        <View
          style={[
            styles.videoWrap,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <Video
            source={{ uri: user.videoUrl }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping
            shouldPlay={false}
          />
        </View>
      ) : (
        <Pressable
          onPress={openEdit}
          style={[
            styles.emptyVideo,
            { borderColor: colors.border, backgroundColor: colors.bgCard },
          ]}
        >
          <VideoIcon size={26} color={colors.primarySoft} />
          <Text style={{ color: colors.text, fontWeight: '800', marginTop: 8 }}>
            Add an intro video
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            15–60 seconds · face clear · good lighting
          </Text>
        </Pressable>
      )}

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
            style={[
              styles.chip,
              { backgroundColor: `${colors.primary}22`, borderColor: colors.primary },
            ]}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{c}</Text>
          </View>
        ))}
      </View>

      <GlassCard style={{ marginTop: 8 }}>
        <Pressable style={styles.row} onPress={openEdit}>
          <Pencil size={20} color={colors.primarySoft} />
          <Text style={[styles.rowText, { color: colors.text }]}>
            Edit profile · photo · bio · video
          </Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => runHostTool('beauty')}>
          <Sparkles size={20} color={colors.accent} />
          <Text style={[styles.rowText, { color: colors.text }]}>
            Beauty filter · {beautyOn ? 'On' : 'Off'}
          </Text>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Earnings')}>
          <Wallet size={20} color={colors.accent} />
          <Text style={[styles.rowText, { color: colors.text }]}>
            Call Analytics & Revenue
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
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bio: {
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 21,
    paddingHorizontal: 18,
    fontSize: 14,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontWeight: '900', fontSize: 18 },
  statLabel: { fontSize: 11, marginTop: 2 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  section: { fontWeight: '900', fontSize: 17 },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  gImgWrap: { width: '31%', aspectRatio: 1, borderRadius: radii.md, overflow: 'hidden' },
  gImg: { width: '100%', height: '100%' },
  emptyCard: {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  videoWrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  video: { width: '100%', height: 220, backgroundColor: '#000' },
  emptyVideo: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 8,
  },
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
