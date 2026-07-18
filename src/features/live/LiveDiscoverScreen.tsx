import { LinearGradient } from 'expo-linear-gradient';
import { Radio, Users } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Platform,
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

function LiveHostCard({
  item,
  isMine,
  onPress,
}: {
  item: LiveRoom;
  isMine: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const thumb = item.thumbnailUrl || item.hostAvatar;
  const isParty = item.mode === 'party';

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 8,
    }).start();
  };

  return (
    <Animated.View style={[styles.cardWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={styles.cardPress}
      >
        <View style={[styles.card, isMine && styles.cardMine, isParty && styles.cardParty]}>
          <Image source={{ uri: thumb }} style={styles.cover} />

          <LinearGradient
            colors={['rgba(7,10,20,0.15)', 'transparent', 'transparent', 'rgba(7,10,20,0.92)']}
            locations={[0, 0.28, 0.52, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Top row */}
          <View style={styles.topRow}>
            <LinearGradient
              colors={isParty ? ['#7C5CFF', '#4F6BFF'] : ['#FF2A7A', '#FF5A3C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.liveBadge}
            >
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>{isParty ? 'PARTY' : 'LIVE'}</Text>
            </LinearGradient>

            <View style={styles.viewerPill}>
              <Users size={11} color="#fff" strokeWidth={2.5} />
              <Text style={styles.viewerText}>{formatViewers(item.viewers)}</Text>
            </View>
          </View>

          {isMine ? (
            <View style={styles.youChip}>
              <Text style={styles.youChipText}>YOU</Text>
            </View>
          ) : null}

          {/* Bottom meta */}
          <View style={styles.cardMeta}>
            <View style={styles.hostRow}>
              <Image source={{ uri: item.hostAvatar || thumb }} style={styles.avatar} />
              <View style={styles.hostText}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.hostName}
                  {item.category ? ` · ${item.category}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.tagRow}>
              {item.level ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>Lv.{item.level}</Text>
                </View>
              ) : null}
              {item.language ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{item.language}</Text>
                </View>
              ) : null}
              {item.badge ? (
                <View style={[styles.tag, styles.tagAccent]}>
                  <Text style={[styles.tagText, styles.tagAccentText]}>{item.badge}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n || 0);
}

export function LiveDiscoverScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, hosts } = useApp();
  const { liveRooms, myLiveRoom } = useLiveStudio();

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
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>LIVE NOW</Text>
          <Text style={[styles.title, { color: colors.text }]}>Discover</Text>
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {discoverRooms.length} host{discoverRooms.length === 1 ? '' : 's'} on stage
          </Text>
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
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.bgCard }]}>
              <Radio size={36} color={colors.primarySoft} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No one live yet</Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              Be the first host on stage. Tap Go Live — other hosts will see you here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMine = item.hostId === user.id;
          return (
            <LiveHostCard
              item={item}
              isMine={isMine}
              onPress={() =>
                navigation.navigate('LiveRoom', {
                  roomId: item.id,
                  hostMode: isMine,
                })
              }
            />
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
    marginBottom: 16,
  },
  eyebrow: {
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  count: { fontSize: 13, marginTop: 4, fontWeight: '600' },
  list: { paddingHorizontal: 14, paddingBottom: 110 },
  row: { gap: 12, marginBottom: 12 },
  empty: { alignItems: 'center', paddingTop: 72, gap: 12, paddingHorizontal: 28 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontWeight: '900', fontSize: 20, letterSpacing: -0.3 },
  emptyBody: { textAlign: 'center', fontSize: 14, lineHeight: 20, fontWeight: '500' },

  cardWrap: {
    flex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#FF2A7A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
      web: {
        boxShadow: '0 12px 28px rgba(255, 42, 122, 0.16)',
      } as object,
      default: {},
    }),
  },
  cardPress: { flex: 1 },
  card: {
    height: 268,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#0E1424',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardMine: {
    borderColor: 'rgba(92,225,230,0.45)',
  },
  cardParty: {
    borderColor: 'rgba(124,92,255,0.4)',
  },
  cover: { width: '100%', height: '100%' },

  topRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  viewerText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  youChip: {
    position: 'absolute',
    top: 44,
    left: 10,
    backgroundColor: 'rgba(92,225,230,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  youChipText: { color: '#071018', fontWeight: '900', fontSize: 10, letterSpacing: 0.6 },

  cardMeta: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 12,
    gap: 8,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: '#1C2740',
  },
  hostText: { flex: 1, minWidth: 0 },
  cardTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: -0.2,
  },
  cardSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    marginTop: 1,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 10,
    fontWeight: '700',
  },
  tagAccent: {
    backgroundColor: 'rgba(255,42,122,0.28)',
  },
  tagAccentText: {
    color: '#FFB4D0',
  },
});
