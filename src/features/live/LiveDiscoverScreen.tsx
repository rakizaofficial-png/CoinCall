import { LinearGradient } from 'expo-linear-gradient';
import { Radio, Users, Video } from 'lucide-react-native';
import { useMemo } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import type { LiveRoom } from '../../services/liveRoomService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function LiveDiscoverScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, hosts } = useApp();
  const { liveRooms, myLiveRoom } = useLiveStudio();

  /** All live rooms + live hosts from presence (so hosts see every live host) */
  const discoverRooms = useMemo(() => {
    const map = new Map<string, LiveRoom>();

    for (const r of liveRooms) {
      if (r.isLive) map.set(r.id, r);
    }

    if (myLiveRoom?.isLive) {
      map.set(myLiveRoom.id, myLiveRoom);
    }

    for (const h of hosts) {
      if (!h.isLive || h.id === user.id) continue;
      const roomId = `live_${h.id}`;
      if (map.has(roomId) || map.has(`party_${h.id}`)) continue;
      const existing = [...map.values()].find((r) => r.hostId === h.id);
      if (existing) continue;
      map.set(roomId, {
        id: roomId,
        hostId: h.id,
        hostName: h.name,
        hostAvatar: h.avatarUrl,
        title: `${h.name}'s Live`,
        category: 'Live',
        language: 'English',
        thumbnailUrl: h.avatarUrl,
        channel: `live_${h.id}`,
        viewers: Math.max(1, Math.floor(h.todayMinutes / 2) || 12),
        likes: 0,
        giftCoins: 0,
        isLive: true,
        mode: 'solo',
        announcement: '',
        level: h.level || 1,
        badge: 'Host',
        startedAt: Date.now(),
      });
    }

    return [...map.values()].sort((a, b) => {
      if (a.hostId === user.id) return -1;
      if (b.hostId === user.id) return 1;
      return (b.viewers || 0) - (a.viewers || 0);
    });
  }, [hosts, liveRooms, myLiveRoom, user.id]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>LIVE NOW</Text>
          <Text style={[styles.title, { color: colors.text }]}>Discover</Text>
        </View>
        <PrimaryButton
          label={myLiveRoom?.isLive ? 'My Room' : 'Go Live'}
          onPress={() => {
            if (myLiveRoom?.isLive) {
              navigation.navigate('LiveRoom', { roomId: myLiveRoom.id, hostMode: true });
            } else {
              navigation.navigate('GoLive');
            }
          }}
          style={{ minWidth: 110, minHeight: 44 }}
        />
      </View>

      <FlatList
        data={discoverRooms}
        keyExtractor={(r) => r.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Radio size={40} color={colors.primarySoft} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No one live yet</Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
              Be the first host on stage. Tap Go Live — other hosts will see you here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMine = item.hostId === user.id;
          return (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate('LiveRoom', {
                  roomId: item.id,
                  hostMode: isMine,
                })
              }
            >
              <Image
                source={{ uri: item.thumbnailUrl || item.hostAvatar }}
                style={styles.cover}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.85)']}
                style={styles.cardGrad}
              />
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>
                  {item.mode === 'party' ? 'PARTY' : 'LIVE'}
                </Text>
              </View>
              {isMine ? (
                <View style={styles.youBadge}>
                  <Text style={styles.youBadgeText}>YOU</Text>
                </View>
              ) : null}
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.hostName} · {item.category}
                  {item.mode === 'party' ? ' · Party' : ''}
                </Text>
                <View style={styles.cardStats}>
                  <Users size={12} color="#fff" />
                  <Text style={styles.cardStat}>{item.viewers}</Text>
                  <Video size={12} color="#fff" />
                  <Text style={styles.cardStat}>{item.language}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  eyebrow: { fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '900' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontWeight: '900', fontSize: 20 },
  card: {
    flex: 1,
    height: 240,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#121826',
  },
  cover: { width: '100%', height: '100%' },
  cardGrad: { ...StyleSheet.absoluteFillObject },
  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#FF3B6B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgeText: { color: '#fff', fontWeight: '900', fontSize: 10 },
  youBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(108,124,255,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  youBadgeText: { color: '#fff', fontWeight: '900', fontSize: 10 },
  cardMeta: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  cardTitle: { color: '#fff', fontWeight: '900', fontSize: 15 },
  cardSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  cardStat: { color: '#fff', fontSize: 11, fontWeight: '700', marginRight: 8 },
});
