import { LinearGradient } from 'expo-linear-gradient';
import { Eye, Radio } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { env } from '../../config/env';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { MOCK_HOSTS } from '../../data/mockData';
import { tabScreenBottomPad } from '../../navigation/layout';
import type { LiveRoom } from '../../services/liveRoomService';
import { useTheme } from '../../theme/ThemeContext';

const FAKE_HOST_IDS = new Set(MOCK_HOSTS.map((h) => h.id));

function apiBase() {
  return (env.apiBaseUrl || '').replace(/\/$/, '');
}

/** Real hosts only — drop mock seeds and demo ids like h1, h2 */
function isRealLiveHost(hostId: string, currentUserId: string) {
  if (!hostId) return false;
  if (hostId === currentUserId) return true;
  if (FAKE_HOST_IDS.has(hostId)) return false;
  if (/^h\d+$/i.test(hostId)) return false;
  if (hostId.startsWith('mock_') || hostId.startsWith('demo_')) return false;
  return true;
}

function LiveHostCard({
  room,
  isMine,
  onPress,
}: {
  room: LiveRoom;
  isMine: boolean;
  onPress: () => void;
}) {
  const cover = room.thumbnailUrl || room.hostAvatar;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]}>
          <Text style={styles.coverInitial}>
            {(room.hostName || 'H').slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.cardGrad}
      />

      <View style={styles.topRow}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <View style={styles.viewers}>
          <Eye size={10} color="#fff" />
          <Text style={styles.viewersText}>{room.viewers || 1}</Text>
        </View>
      </View>

      {isMine ? (
        <View style={styles.youBadge}>
          <Text style={styles.youBadgeText}>YOU</Text>
        </View>
      ) : null}

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {room.hostName}
        </Text>
      </View>
    </Pressable>
  );
}

export function LiveDiscoverScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { liveRooms, myLiveRoom } = useLiveStudio();
  const [apiRooms, setApiRooms] = useState<LiveRoom[]>([]);

  const refreshFeed = useCallback(async () => {
    try {
      const roomsRes = await fetch(`${apiBase()}/live/rooms`);
      if (!roomsRes.ok) return;
      const data = (await roomsRes.json()) as { rooms?: LiveRoom[] };
      setApiRooms(
        (data.rooms || []).filter(
          (r) =>
            r.isLive &&
            r.mode !== 'party' &&
            isRealLiveHost(String(r.hostId || ''), user.id),
        ),
      );
    } catch {
      // keep last
    }
  }, [user.id]);

  useEffect(() => {
    void refreshFeed();
    const t = setInterval(() => void refreshFeed(), 2500);
    return () => clearInterval(t);
  }, [refreshFeed]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../../services/realtimeWs').then(({ subscribeRealtime }) => {
      unsub = subscribeRealtime((event) => {
        if (event.type === 'live:room' || event.type === 'live:ended') {
          void refreshFeed();
        }
      });
    });
    return () => unsub?.();
  }, [refreshFeed]);

  /** Only real live rooms — never mock / fake hosts */
  const discoverRooms = useMemo(() => {
    const map = new Map<string, LiveRoom>();

    const add = (room: LiveRoom | null | undefined) => {
      if (!room?.isLive || room.mode === 'party' || !room.hostId) return;
      if (!isRealLiveHost(room.hostId, user.id)) return;
      // Host just ended — never show self until myLiveRoom is live again
      if (room.hostId === user.id && !myLiveRoom?.isLive) return;
      const key = `live_${room.hostId}`;
      const next: LiveRoom = {
        ...room,
        id: room.id || key,
        viewers: Math.max(1, Number(room.viewers) || 1),
        thumbnailUrl: room.thumbnailUrl || room.hostAvatar || '',
      };
      const prev = map.get(key);
      map.set(key, prev ? { ...prev, ...next, id: key } : { ...next, id: key });
    };

    for (const r of liveRooms) add(r);
    for (const r of apiRooms) add(r);
    if (myLiveRoom?.isLive) add(myLiveRoom);

    return [...map.values()].sort((a, b) => {
      if (a.hostId === user.id) return -1;
      if (b.hostId === user.id) return 1;
      return (b.startedAt || 0) - (a.startedAt || 0);
    });
  }, [apiRooms, liveRooms, myLiveRoom, user.id]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>LIVE</Text>
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
          style={{ minWidth: 100, minHeight: 40 }}
        />
      </View>

      <FlatList
        data={discoverRooms}
        keyExtractor={(r) => r.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: tabScreenBottomPad(insets.bottom) },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Radio size={32} color={colors.primarySoft} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No live hosts</Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 13 }}>
              Real hosts appear here when they go live.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <LiveHostCard
            room={item}
            isMine={item.hostId === user.id}
            onPress={() =>
              navigation.navigate('LiveRoom', {
                roomId: item.id,
                hostMode: item.hostId === user.id,
              })
            }
          />
        )}
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
    marginBottom: 12,
    gap: 12,
  },
  eyebrow: { fontWeight: '800', fontSize: 10, letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  list: { paddingHorizontal: 14, paddingBottom: 110 },
  row: { gap: 10, marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 72, gap: 8, paddingHorizontal: 28 },
  emptyTitle: { fontWeight: '800', fontSize: 17 },

  card: {
    flex: 1,
    maxWidth: '48.5%',
    height: 168,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#10182A',
  },
  cover: { width: '100%', height: '100%' },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2438',
  },
  coverInitial: { color: '#fff', fontSize: 28, fontWeight: '800' },
  cardGrad: { ...StyleSheet.absoluteFill },
  topRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveBadge: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { color: '#fff', fontWeight: '800', fontSize: 9, letterSpacing: 0.3 },
  viewers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  viewersText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  youBadge: {
    position: 'absolute',
    top: 36,
    left: 8,
    backgroundColor: 'rgba(108,124,255,0.92)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: { color: '#fff', fontWeight: '800', fontSize: 9 },
  cardBody: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  cardName: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
