import { ChevronLeft, Sparkles } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../../components/GradientButton';
import type { RootStackParamList } from '../../navigation/types';
import {
  fetchFanProfile,
  type FanProfile,
} from '../../services/hostOutreachService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'FanProfile'>;

function fallbackAvatar(userId: string) {
  return `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(userId)}&size=400`;
}

export function FanProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId, userName, avatarUrl } = route.params;
  const [profile, setProfile] = useState<FanProfile | null>({
    userId,
    displayName: userName || 'Fan',
    avatarUrl,
    online: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    (async () => {
      const next = await fetchFanProfile(userId);
      if (dead) return;
      if (next) {
        setProfile({
          ...next,
          displayName: next.displayName || userName || 'Fan',
          avatarUrl: next.avatarUrl || avatarUrl,
        });
      }
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [userId, userName, avatarUrl]);

  const name = profile?.displayName || userName || 'Fan';
  const photo =
    profile?.avatarUrl ||
    avatarUrl ||
    fallbackAvatar(userId);
  const online = profile?.online ?? false;

  const openChat = () => {
    navigation.navigate('DirectChat', {
      peerId: userId,
      peerName: name,
      peerAvatar: photo,
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={['#1A1020', colors.bg, '#070A14']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.back}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>

        <View style={styles.heroWrap}>
          <View style={styles.glow} />
          <Image source={{ uri: photo }} style={styles.hero} />
          <View
            style={[
              styles.onlinePill,
              {
                backgroundColor: online
                  ? 'rgba(52,211,153,0.2)'
                  : 'rgba(255,255,255,0.08)',
              },
            ]}
          >
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: online ? colors.online : colors.textMuted },
              ]}
            />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
              {online ? 'Active now' : 'Recently online'}
            </Text>
          </View>
        </View>

        <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Luma fan · ready to chat
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <View style={styles.stats}>
            <View
              style={[
                styles.stat,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statValue, { color: colors.blush }]}>
                {profile?.appId || '——'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                App ID
              </Text>
            </View>
            <View
              style={[
                styles.stat,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statValue, { color: colors.blush }]}>
                {profile?.isPremium ? 'VIP' : 'Fan'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Status
              </Text>
            </View>
            <View
              style={[
                styles.stat,
                { backgroundColor: colors.bgCard, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.statValue, { color: colors.blush }]}>
                {profile?.xp ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                XP
              </Text>
            </View>
          </View>
        )}

        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardRow}>
            <Sparkles size={18} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Connect deeper
            </Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            Message {name.split(' ')[0]} while they are on Luma — replies show
            in your private inbox.
          </Text>
        </View>

        <GradientButton label="Message" onPress={openChat} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { alignSelf: 'flex-start', marginBottom: 8 },
  heroWrap: { alignItems: 'center', marginTop: 8 },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,77,109,0.18)',
    top: 10,
  },
  hero: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: '#1a1a2e',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  name: {
    marginTop: 18,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  sub: {
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  stat: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: { fontWeight: '900', fontSize: 16 },
  statLabel: { marginTop: 4, fontSize: 11, fontWeight: '700' },
  card: {
    marginTop: 18,
    marginBottom: 20,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '800', fontSize: 15 },
  cardBody: { marginTop: 8, lineHeight: 20, fontWeight: '500' },
});
