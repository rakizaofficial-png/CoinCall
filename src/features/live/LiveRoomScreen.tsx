import { LinearGradient } from 'expo-linear-gradient';
import {
  Gift,
  Heart,
  Mic,
  MicOff,
  Share2,
  Sparkles,
  Users,
  VideoOff,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GIFT_CATALOG } from '../../data/gifts';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import {
  setAgoraBeauty,
  setAgoraCameraOff,
  setAgoraMuted,
  startAgoraLiveBroadcast,
  stopAgoraCall,
  switchAgoraCamera,
} from '../../services/agoraService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';
import * as Clipboard from 'expo-clipboard';

type Props = {
  navigation: any;
  route: { params: { roomId: string; hostMode?: boolean } };
};

function formatLive(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function LiveRoomScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const {
    liveRooms,
    myLiveRoom,
    comments,
    gifts,
    giftOverlay,
    liveSeconds,
    sendComment,
    sendGift,
    likeRoom,
    stopLive,
    openRoom,
    setAnnouncement,
    muteUser,
    kickUser,
    blockUserInRoom,
  } = useLiveStudio();

  const roomId = route.params.roomId;
  const hostMode = Boolean(route.params.hostMode);
  const room =
    (myLiveRoom?.id === roomId ? myLiveRoom : null) ||
    liveRooms.find((r) => r.id === roomId) ||
    myLiveRoom;

  const [text, setText] = useState('');
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [rankPeriod, setRankPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [following, setFollowing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [beauty, setBeauty] = useState(true);
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const localMountReady = useRef(false);
  const hearts = useSharedValue(0);
  const seenCommentIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    openRoom(roomId);
  }, [openRoom, roomId]);

  useEffect(() => {
    comments.forEach((c) => {
      if (seenCommentIds.current.has(c.id)) return;
      seenCommentIds.current.add(c.id);
      if (c.kind === 'system' && /joined|started/i.test(c.text)) {
        setJoinToast(c.text);
        setTimeout(() => setJoinToast(null), 2400);
      }
      if (c.kind === 'system' && /left|ended/i.test(c.text)) {
        setJoinToast(c.text);
        setTimeout(() => setJoinToast(null), 2400);
      }
    });
  }, [comments]);

  useEffect(() => {
    if (!hostMode || Platform.OS !== 'web' || !room) return;
    let cancelled = false;
    (async () => {
      const mount = document.getElementById('live-local-mount');
      if (!mount) return;
      let el = document.getElementById('live-local') as HTMLDivElement | null;
      if (!el) {
        el = document.createElement('div');
        el.id = 'live-local';
        el.style.width = '100%';
        el.style.height = '100%';
        mount.appendChild(el);
      }
      try {
        await startAgoraLiveBroadcast({
          channel: room.channel,
          localVideoEl: el,
        });
        await setAgoraBeauty(beauty);
        localMountReady.current = true;
      } catch (e) {
        if (!cancelled) {
          notify('Live video', e instanceof Error ? e.message : 'Camera failed');
        }
      }
    })();
    return () => {
      cancelled = true;
      void stopAgoraCall();
      document.getElementById('live-local')?.remove();
    };
  }, [beauty, hostMode, room?.channel, room?.id]);

  const leaderboard = useMemo(() => {
    const now = Date.now();
    const windowMs =
      rankPeriod === 'daily'
        ? 24 * 3600_000
        : rankPeriod === 'weekly'
          ? 7 * 24 * 3600_000
          : 30 * 24 * 3600_000;
    const map = new Map<string, { name: string; avatar: string; coins: number }>();
    gifts.forEach((g) => {
      if (now - g.createdAt > windowMs) return;
      const prev = map.get(g.fromId) || {
        name: g.fromName,
        avatar: g.fromAvatar,
        coins: 0,
      };
      prev.coins += g.coins * (g.combo || 1);
      map.set(g.fromId, prev);
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 10);
  }, [gifts, rankPeriod]);

  const vipUsers = leaderboard.slice(0, 3);

  const heartStyle = useAnimatedStyle(() => ({
    opacity: hearts.value,
    transform: [{ translateY: (1 - hearts.value) * -40 }, { scale: 0.8 + hearts.value * 0.4 }],
  }));

  const onLike = () => {
    likeRoom();
    hearts.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 700 }));
  };

  const onEnd = async () => {
    await stopLive();
    await stopAgoraCall();
    navigation.goBack();
  };

  const onShare = async () => {
    const link = `https://coincall-host.onrender.com/?room=${roomId}`;
    await Clipboard.setStringAsync(link);
    notify('Shared', 'Live link copied');
  };

  if (!room) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={{ color: '#fff' }}>Room not found</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.accent, marginTop: 12 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {Platform.OS === 'web' && hostMode ? (
        // @ts-expect-error web video mount
        <div id="live-local-mount" style={webFill} />
      ) : (
        <Image source={{ uri: room.thumbnailUrl || room.hostAvatar }} style={styles.cover} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.hostChip}>
          <Image source={{ uri: room.hostAvatar }} style={styles.hostAv} />
          <View>
            <Text style={styles.hostName}>{room.hostName}</Text>
            <Text style={styles.hostMeta}>
              Lv{room.level} · {room.badge}
            </Text>
          </View>
          {!hostMode ? (
            <Pressable
              style={[styles.followBtn, following && styles.followOn]}
              onPress={() => {
                setFollowing((v) => !v);
                notify(following ? 'Unfollowed' : 'Following', room.hostName);
              }}
            >
              <Text style={styles.followText}>{following ? 'Following' : 'Follow'}</Text>
            </Pressable>
          ) : null}
          <View style={styles.livePill}>
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          <View style={styles.statPill}>
            <Users size={14} color="#fff" />
            <Text style={styles.statText}>{room.viewers}</Text>
          </View>
          <Text style={styles.timer}>{formatLive(hostMode ? liveSeconds : 0)}</Text>
          <Pressable onPress={hostMode ? onEnd : () => navigation.goBack()} style={styles.close}>
            <X size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {room.announcement ? (
        <View style={styles.announce}>
          <Text style={styles.announceText} numberOfLines={2}>
            📌 {room.announcement}
          </Text>
        </View>
      ) : null}

      <Pressable style={styles.leader} onPress={() => setRankOpen(true)}>
        {leaderboard.slice(0, 5).map((u, i) => (
          <View key={u.id} style={styles.leaderItem}>
            <Text style={styles.leaderRank}>{i + 1}</Text>
            <Image source={{ uri: u.avatar }} style={styles.leaderAv} />
          </View>
        ))}
      </Pressable>

      {vipUsers.length > 0 ? (
        <View style={styles.vipRow}>
          <Text style={styles.vipLabel}>VIP</Text>
          {vipUsers.map((u) => (
            <Image key={u.id} source={{ uri: u.avatar }} style={styles.vipAv} />
          ))}
        </View>
      ) : null}

      {room.mode === 'party' && room.seats ? (
        <View style={styles.partySeats}>
          {room.seats.map((seat) => (
            <View
              key={seat.index}
              style={[
                styles.partySeat,
                seat.hostId ? styles.partySeatOn : null,
              ]}
            >
              {seat.hostId ? (
                <Image source={{ uri: seat.avatarUrl }} style={styles.partyAv} />
              ) : (
                <Text style={styles.partyEmpty}>{seat.locked ? '🔒' : '+'}</Text>
              )}
              <Text style={styles.partySeatLabel} numberOfLines={1}>
                {seat.name || (seat.kind === 'video' ? 'Video' : 'Audio')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {joinToast ? (
        <View style={styles.joinToast} pointerEvents="none">
          <Text style={styles.joinToastText}>{joinToast}</Text>
        </View>
      ) : null}

      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        style={styles.comments}
        contentContainerStyle={{ paddingBottom: 8 }}
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <Text style={styles.commentUser}>{item.userName}</Text>
            <Text style={styles.commentText}>{item.text}</Text>
          </View>
        )}
      />

      {giftOverlay ? (
        <View style={styles.giftBurst} pointerEvents="none">
          <Text style={styles.giftEmoji}>{giftOverlay.giftEmoji}</Text>
          <Text style={styles.giftLabel}>
            {giftOverlay.fromName} sent {giftOverlay.giftName}
            {giftOverlay.combo > 1 ? ` x${giftOverlay.combo}` : ''}
          </Text>
        </View>
      ) : null}

      <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">
        <Heart size={48} color="#FF6B8A" fill="#FF6B8A" />
      </Animated.View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Say something…"
          placeholderTextColor="rgba(255,255,255,0.5)"
          onSubmitEditing={() => {
            void sendComment(text);
            setText('');
          }}
        />
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            void sendComment(text);
            setText('');
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Send</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={onLike}>
          <Heart size={20} color="#FF6B8A" />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setGiftsOpen(true)}>
          <Gift size={20} color="#F5C14C" />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={onShare}>
          <Share2 size={18} color="#fff" />
        </Pressable>
        {hostMode ? (
          <Pressable style={styles.iconBtn} onPress={() => setModsOpen((v) => !v)}>
            <Users size={18} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      {hostMode ? (
        <View style={[styles.hostControls, { bottom: insets.bottom + 72 }]}>
          <Pressable
            style={styles.hCtrl}
            onPress={async () => {
              const next = !muted;
              setMuted(next);
              await setAgoraMuted(next);
            }}
          >
            {muted ? <MicOff size={18} color="#fff" /> : <Mic size={18} color="#fff" />}
          </Pressable>
          <Pressable
            style={styles.hCtrl}
            onPress={async () => {
              const next = !camOff;
              setCamOff(next);
              await setAgoraCameraOff(next);
            }}
          >
            <VideoOff size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.hCtrl} onPress={() => void switchAgoraCamera()}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Flip</Text>
          </Pressable>
          <Pressable
            style={[styles.hCtrl, beauty && { backgroundColor: 'rgba(108,124,255,0.7)' }]}
            onPress={async () => {
              const next = !beauty;
              setBeauty(next);
              await setAgoraBeauty(next);
            }}
          >
            <Sparkles size={18} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {giftsOpen ? (
        <View style={styles.giftSheet}>
          <Text style={styles.sheetTitle}>Send a gift</Text>
          <Text style={styles.sheetSub}>Tap again fast for combo · luxury effects</Text>
          <View style={styles.giftGrid}>
            {GIFT_CATALOG.map((g) => (
              <Pressable
                key={g.id}
                style={[
                  styles.giftItem,
                  g.tier === 'legendary' && { borderColor: '#F5C14C', borderWidth: 1 },
                  g.tier === 'luxury' && { borderColor: '#9B8CFF', borderWidth: 1 },
                ]}
                onPress={() => {
                  void sendGift(g.id);
                  setGiftsOpen(false);
                }}
              >
                <Text style={styles.giftItemEmoji}>{g.emoji}</Text>
                <Text style={styles.giftItemName}>{g.name}</Text>
                <Text style={styles.giftItemCoins}>{g.coins}</Text>
                <Text style={styles.giftTier}>{g.tier}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setGiftsOpen(false)}>
            <Text style={styles.closeSheet}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      {rankOpen ? (
        <View style={styles.giftSheet}>
          <Text style={styles.sheetTitle}>Gift ranking</Text>
          <View style={styles.rankTabs}>
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setRankPeriod(p)}
                style={[styles.rankTab, rankPeriod === p && styles.rankTabOn]}
              >
                <Text style={styles.rankTabText}>{p}</Text>
              </Pressable>
            ))}
          </View>
          {leaderboard.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.6)' }}>No senders yet</Text>
          ) : (
            leaderboard.map((u, i) => (
              <View key={u.id} style={styles.rankRow}>
                <Text style={styles.leaderRank}>{i + 1}</Text>
                <Image source={{ uri: u.avatar }} style={styles.leaderAv} />
                <Text style={{ color: '#fff', flex: 1, fontWeight: '700' }}>{u.name}</Text>
                <Text style={{ color: '#F5C14C', fontWeight: '900' }}>{u.coins}</Text>
              </View>
            ))
          )}
          <Text style={[styles.sheetSub, { marginTop: 12 }]}>Gift history</Text>
          {gifts.slice(0, 12).map((g) => (
            <Text key={g.id} style={styles.histLine}>
              {g.giftEmoji} {g.fromName} · {g.giftName}
              {g.combo > 1 ? ` x${g.combo}` : ''} · {g.coins}
            </Text>
          ))}
          <Pressable onPress={() => setRankOpen(false)}>
            <Text style={styles.closeSheet}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      {modsOpen && hostMode ? (
        <View style={styles.modSheet}>
          <Text style={styles.sheetTitle}>Moderator</Text>
          <Pressable
            style={styles.modBtn}
            onPress={() => {
              const msg = 'Be respectful · No spam';
              void setAnnouncement(msg);
            }}
          >
            <Text style={styles.modText}>Pin announcement</Text>
          </Pressable>
          <Pressable
            style={styles.modBtn}
            onPress={() => muteUser('viewer_demo')}
          >
            <Text style={styles.modText}>Mute recent commenter</Text>
          </Pressable>
          <Pressable style={styles.modBtn} onPress={() => kickUser('viewer_demo')}>
            <Text style={styles.modText}>Kick user</Text>
          </Pressable>
          <Pressable style={styles.modBtn} onPress={() => blockUserInRoom('viewer_demo')}>
            <Text style={styles.modText}>Block user</Text>
          </Pressable>
          <Pressable onPress={() => setModsOpen(false)}>
            <Text style={styles.closeSheet}>Close</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const webFill: any = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  background: '#000',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070F' },
  center: { alignItems: 'center', justifyContent: 'center' },
  cover: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 2,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 6,
    paddingRight: 10,
    borderRadius: radii.full,
  },
  hostAv: { width: 36, height: 36, borderRadius: 18 },
  hostName: { color: '#fff', fontWeight: '800', fontSize: 13 },
  hostMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  livePill: {
    marginLeft: 6,
    backgroundColor: '#FF3B6B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  livePillText: { color: '#fff', fontWeight: '900', fontSize: 10 },
  followBtn: {
    marginLeft: 6,
    backgroundColor: '#6C7CFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  followOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  followText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  vipRow: {
    position: 'absolute',
    left: 12,
    top: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 2,
  },
  vipLabel: { color: '#F5C14C', fontWeight: '900', fontSize: 11 },
  vipAv: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#F5C14C' },
  partySeats: {
    position: 'absolute',
    right: 10,
    top: 200,
    width: 92,
    gap: 6,
    zIndex: 2,
  },
  partySeat: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    padding: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  partySeatOn: { borderColor: 'rgba(108,124,255,0.8)' },
  partyAv: { width: 36, height: 36, borderRadius: 18 },
  partyEmpty: { color: '#fff', fontSize: 18, fontWeight: '800' },
  partySeatLabel: { color: '#fff', fontSize: 10, marginTop: 4, fontWeight: '700' },
  joinToast: {
    position: 'absolute',
    top: '28%',
    alignSelf: 'center',
    backgroundColor: 'rgba(108,124,255,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    zIndex: 6,
  },
  joinToastText: { color: '#fff', fontWeight: '800' },
  sheetSub: { color: 'rgba(255,255,255,0.55)', marginBottom: 10, fontSize: 12 },
  giftTier: { color: 'rgba(255,255,255,0.45)', fontSize: 9, marginTop: 2 },
  rankTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  rankTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rankTabOn: { backgroundColor: 'rgba(108,124,255,0.7)' },
  rankTabText: { color: '#fff', fontWeight: '800', fontSize: 12, textTransform: 'capitalize' },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  histLine: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 4 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  statText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  timer: { color: '#fff', fontWeight: '800', fontVariant: ['tabular-nums'] },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  announce: {
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: 'rgba(108,124,255,0.35)',
    borderRadius: 12,
    padding: 10,
    zIndex: 2,
  },
  announceText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  leader: {
    position: 'absolute',
    right: 12,
    top: 120,
    gap: 6,
    zIndex: 2,
  },
  leaderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 4,
    paddingRight: 8,
  },
  leaderRank: { color: '#F5C14C', fontWeight: '900', fontSize: 11, marginLeft: 4 },
  leaderAv: { width: 28, height: 28, borderRadius: 14 },
  comments: {
    position: 'absolute',
    left: 12,
    right: 100,
    bottom: 120,
    maxHeight: 220,
    zIndex: 2,
  },
  comment: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  commentUser: { color: '#9B8CFF', fontWeight: '800', fontSize: 11 },
  commentText: { color: '#fff', fontSize: 13 },
  giftBurst: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  giftEmoji: { fontSize: 72 },
  giftLabel: { color: '#fff', fontWeight: '800', marginTop: 8 },
  heartBurst: {
    position: 'absolute',
    bottom: 160,
    right: 40,
    zIndex: 5,
  },
  bottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 3,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radii.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    minHeight: 44,
  },
  iconBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  hostControls: {
    position: 'absolute',
    right: 12,
    gap: 8,
    zIndex: 3,
  },
  hCtrl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#121826',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 32,
    zIndex: 10,
  },
  sheetTitle: { color: '#fff', fontWeight: '900', fontSize: 18, marginBottom: 12 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  giftItem: {
    width: '22%',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 10,
  },
  giftItemEmoji: { fontSize: 28 },
  giftItemName: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4 },
  giftItemCoins: { color: '#F5C14C', fontSize: 11, fontWeight: '800' },
  closeSheet: {
    color: '#9B8CFF',
    textAlign: 'center',
    marginTop: 14,
    fontWeight: '800',
  },
  modSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 100,
    backgroundColor: '#121826',
    borderRadius: 20,
    padding: 16,
    zIndex: 10,
  },
  modBtn: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modText: { color: '#fff', fontWeight: '700' },
});
