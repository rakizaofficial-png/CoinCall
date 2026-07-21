import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FlipHorizontal,
  Gift,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Sparkles,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlamourGiftOverlay } from '../../components/gifts/GlamourGiftOverlay';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import {
  ADULT_PHOTO_UNLOCK_MIN_COINS,
  PHOTO_UNLOCK_MIN_COINS,
} from '../../data/gifts';
import {
  setAgoraBeauty,
  setAgoraCameraOff,
  setAgoraMuted,
  startAgoraLiveBroadcast,
  stopAgoraCall,
  switchAgoraCamera,
} from '../../services/agoraService';
import { uploadHostMedia } from '../../services/mediaUploadService';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = {
  navigation: any;
  route: { params: { roomId: string; hostMode?: boolean } };
};

function formatLive(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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
    lockedPhotos,
    liveSeconds,
    stopLive,
    openRoom,
    setAnnouncement,
    addGiftLockedPhoto,
  } = useLiveStudio();

  const roomId = route.params.roomId;
  const hostMode = Boolean(route.params.hostMode);
  const room =
    (myLiveRoom?.id === roomId ? myLiveRoom : null) ||
    liveRooms.find((r) => r.id === roomId) ||
    myLiveRoom;

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [beauty, setBeauty] = useState(true);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [pinText, setPinText] = useState('');
  const [lockCaption, setLockCaption] = useState('');
  const [lockCoins, setLockCoins] = useState(String(PHOTO_UNLOCK_MIN_COINS));
  const [adultLock, setAdultLock] = useState(false);
  const [busyLock, setBusyLock] = useState(false);
  const localMountReady = useRef(false);

  useEffect(() => {
    openRoom(roomId);
  }, [openRoom, roomId]);

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
          beauty: beauty ? 'snap' : 'off',
        });
        await setAgoraBeauty(beauty ? 'snap' : 'off');
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

  const feed = useMemo(() => {
    const giftLines = gifts.slice(0, 20).map((g) => ({
      id: `g_${g.id}`,
      text: `${g.fromName} sent ${g.giftEmoji} ${g.giftName}`,
      kind: 'gift' as const,
    }));
    const commentLines = comments
      .filter((c) => c.kind !== 'system' || /joined|gift/i.test(c.text))
      .slice(-40)
      .map((c) => ({
        id: c.id,
        text:
          c.kind === 'join'
            ? `${c.userName} joined`
            : c.kind === 'gift'
              ? `${c.userName} ${c.text}`
              : c.kind === 'system'
                ? c.text
                : `${c.userName}: ${c.text}`,
        kind: (c.kind === 'gift' ? 'gift' : 'chat') as 'gift' | 'chat',
      }));
    return [...giftLines, ...commentLines];
  }, [comments, gifts]);

  const onEnd = async () => {
    await stopLive();
    await stopAgoraCall();
    navigation.goBack();
  };

  const savePinnedMessage = async () => {
    const text = pinText.trim();
    if (!text) {
      notify('Set message', 'Write a pinned message first');
      return;
    }
    try {
      await setAnnouncement(text);
      notify('Pinned', 'Live message set for viewers');
      setMessageOpen(false);
      setPinText('');
    } catch (e) {
      notify('Failed', e instanceof Error ? e.message : 'Try again');
    }
  };

  const pickLockedPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Photos', 'Allow photo access to lock live content');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setBusyLock(true);
    try {
      const uri = result.assets[0].uri;
      const uploaded = await uploadHostMedia({
        hostUid: user.id,
        uri,
        kind: 'image',
        folder: 'photos',
      });
      const url = uploaded || uri;
      const coins = Math.max(
        adultLock ? ADULT_PHOTO_UNLOCK_MIN_COINS : PHOTO_UNLOCK_MIN_COINS,
        Number(lockCoins) || PHOTO_UNLOCK_MIN_COINS,
      );
      await addGiftLockedPhoto(
        url,
        lockCaption.trim() ||
          (adultLock ? 'Adult exclusive · gift to unlock' : 'Gift to unlock'),
        coins,
      );
      setLockCaption('');
      setLockOpen(false);
    } catch (e) {
      notify('Lock live failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusyLock(false);
    }
  };

  if (!room) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={{ color: '#fff' }}>Live not found</Text>
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
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.78)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.hostChip}>
          <Image source={{ uri: room.hostAvatar }} style={styles.hostAv} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.hostName} numberOfLines={1}>
              {room.hostName}
            </Text>
            <Text style={styles.timer}>{formatLive(hostMode ? liveSeconds : 0)}</Text>
          </View>
          <View style={styles.livePill}>
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          {lockedPhotos.length > 0 ? (
            <View style={[styles.statPill, styles.lockPill]}>
              <Lock size={12} color="#FFB4D0" />
              <Text style={styles.statText}>{lockedPhotos.length}</Text>
            </View>
          ) : null}
          <View style={styles.statPill}>
            <Text style={styles.statText}>💎 {Math.max(room.giftCoins || 0, 0)}</Text>
          </View>
          <View style={styles.statPill}>
            <Users size={14} color="#fff" />
            <Text style={styles.statText}>{Math.max(room.viewers, 0)}</Text>
          </View>
          <Pressable onPress={hostMode ? onEnd : () => navigation.goBack()} style={styles.close}>
            <X size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {room.announcement ? (
        <View style={[styles.pinBanner, { top: insets.top + 64 }]}>
          <MessageSquare size={12} color="#F5C14C" />
          <Text style={styles.pinText} numberOfLines={2}>
            {room.announcement}
          </Text>
        </View>
      ) : null}

      <View style={[styles.feed, { bottom: insets.bottom + 100 }]}>
        <FlatList
          data={feed}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          inverted
          renderItem={({ item }) => (
            <View style={[styles.feedRow, item.kind === 'gift' && styles.feedGift]}>
              <Text style={styles.feedText} numberOfLines={2}>
                {item.text}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.feedEmpty}>Waiting for viewers…</Text>
          }
        />
      </View>

      {giftOverlay ? (
        <GlamourGiftOverlay
          item={{
            id: giftOverlay.id || `live_${Date.now()}`,
            giftId: giftOverlay.giftId,
            emoji: giftOverlay.giftEmoji || '🎁',
            giftName: giftOverlay.giftName || 'Gift',
            senderName: giftOverlay.fromName || 'Fan',
            receiverName: room?.hostName || 'Host',
            coins: giftOverlay.coins || 0,
            combo: giftOverlay.combo,
          }}
        />
      ) : null}

      {hostMode ? (
        <View style={[styles.fabColumn, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={styles.fab}
            onPress={async () => {
              const next = !muted;
              setMuted(next);
              await setAgoraMuted(next);
            }}
          >
            {muted ? <MicOff size={20} color="#fff" /> : <Mic size={20} color="#fff" />}
          </Pressable>

          <Pressable
            style={styles.fab}
            onPress={async () => {
              const next = !cameraOff;
              setCameraOff(next);
              await setAgoraCameraOff(next);
            }}
          >
            {cameraOff ? <VideoOff size={20} color="#fff" /> : <Video size={20} color="#fff" />}
          </Pressable>

          <Pressable style={styles.fab} onPress={() => void switchAgoraCamera()}>
            <FlipHorizontal size={20} color="#fff" />
          </Pressable>

          <Pressable
            style={[styles.fab, beauty && styles.fabOn]}
            onPress={async () => {
              const next = !beauty;
              setBeauty(next);
              await setAgoraBeauty(next ? 'snap' : 'off');
              notify('Filter', next ? 'Beauty on' : 'Beauty off');
            }}
          >
            <Sparkles size={20} color="#fff" />
          </Pressable>

          <Pressable style={[styles.fab, styles.fabLock]} onPress={() => setLockOpen(true)}>
            <Lock size={20} color="#FFB4D0" />
          </Pressable>

          <Pressable style={styles.fab} onPress={() => setMessageOpen(true)}>
            <MessageSquare size={20} color="#F5C14C" />
          </Pressable>

          <Pressable style={styles.fab} onPress={() => setGiftsOpen(true)}>
            <Gift size={20} color="#F5C14C" />
          </Pressable>

          <Pressable style={styles.fabEnd} onPress={() => void onEnd()}>
            <X size={22} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.fabColumn, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.fabGift} onPress={() => setGiftsOpen(true)}>
            <Gift size={22} color="#fff" />
          </Pressable>
        </View>
      )}

      {giftsOpen ? (
        <View style={styles.giftSheet}>
          <Text style={styles.sheetTitle}>
            {hostMode ? 'Recent gifts' : 'Send a gift'}
          </Text>
          {gifts.length === 0 ? (
            <Text style={styles.sheetSub}>No gifts yet — viewers can send from Luma</Text>
          ) : (
            gifts.slice(0, 15).map((g) => (
              <Text key={g.id} style={styles.histLine}>
                {g.giftEmoji} {g.fromName} · {g.giftName} · {g.coins}
              </Text>
            ))
          )}
          <Pressable onPress={() => setGiftsOpen(false)}>
            <Text style={styles.closeSheet}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Lock Live sheet */}
      <Modal visible={lockOpen} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.toolSheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Lock Live</Text>
              <Pressable onPress={() => setLockOpen(false)} hitSlop={10}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>
              Add gift-gated photos. Fans unlock with Glamour (≥{PHOTO_UNLOCK_MIN_COINS})
              or Adult gifts (≥{ADULT_PHOTO_UNLOCK_MIN_COINS}).
            </Text>

            <View style={styles.lockToggleRow}>
              <Pressable
                style={[styles.lockToggle, !adultLock && styles.lockToggleOn]}
                onPress={() => {
                  setAdultLock(false);
                  setLockCoins(String(PHOTO_UNLOCK_MIN_COINS));
                }}
              >
                <Text style={styles.lockToggleText}>Standard</Text>
              </Pressable>
              <Pressable
                style={[styles.lockToggle, adultLock && styles.lockToggleAdult]}
                onPress={() => {
                  setAdultLock(true);
                  setLockCoins(String(ADULT_PHOTO_UNLOCK_MIN_COINS));
                }}
              >
                <Text style={styles.lockToggleText}>Adult 18+</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              value={lockCaption}
              onChangeText={setLockCaption}
              placeholder="Caption (optional)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              maxLength={80}
            />
            <TextInput
              style={styles.input}
              value={lockCoins}
              onChangeText={setLockCoins}
              placeholder="Unlock coins"
              placeholderTextColor="rgba(255,255,255,0.4)"
              keyboardType="number-pad"
              maxLength={6}
            />

            {lockedPhotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {lockedPhotos.map((p) => (
                  <View key={p.id} style={styles.lockThumbWrap}>
                    <Image source={{ uri: p.url }} style={styles.lockThumb} />
                    <Text style={styles.lockThumbCoins}>{p.unlockCoins}💎</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, busyLock && { opacity: 0.6 }]}
              disabled={busyLock}
              onPress={() => void pickLockedPhoto()}
            >
              <Lock size={16} color="#1a1200" />
              <Text style={styles.primaryBtnText}>
                {busyLock ? 'Adding…' : 'Add locked photo'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Set message sheet */}
      <Modal visible={messageOpen} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.toolSheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Set message</Text>
              <Pressable onPress={() => setMessageOpen(false)} hitSlop={10}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>
              Pin a message for everyone watching your live
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={pinText}
              onChangeText={setPinText}
              placeholder="Welcome · rules · gift goals…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline
              maxLength={160}
            />
            <Pressable style={styles.primaryBtn} onPress={() => void savePinnedMessage()}>
              <MessageSquare size={16} color="#1a1200" />
              <Text style={styles.primaryBtnText}>Pin to live</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const webFill: any = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  background: '#000',
  zIndex: 0,
  pointerEvents: 'none',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070F' },
  center: { alignItems: 'center', justifyContent: 'center' },
  cover: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    zIndex: 20,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    maxWidth: '58%',
  },
  hostAv: { width: 36, height: 36, borderRadius: 18 },
  hostName: { color: '#fff', fontWeight: '800', fontSize: 13 },
  timer: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  livePill: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  livePillText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  lockPill: {
    backgroundColor: 'rgba(255,42,122,0.35)',
    borderColor: 'rgba(255,180,208,0.45)',
  },
  statText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBanner: {
    position: 'absolute',
    left: 12,
    right: 88,
    zIndex: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(12,16,28,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,193,76,0.4)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pinText: { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },
  feed: {
    position: 'absolute',
    left: 12,
    right: 88,
    maxHeight: 240,
    zIndex: 20,
    elevation: 20,
  },
  feedRow: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingHorizontal: 2,
    paddingVertical: 3,
    marginBottom: 4,
    maxWidth: '100%',
  },
  feedGift: {
    backgroundColor: 'rgba(123,44,255,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,181,253,0.35)',
  },
  feedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedEmpty: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 },
  fabColumn: {
    position: 'absolute',
    right: 14,
    bottom: 0,
    zIndex: 20,
    alignItems: 'center',
    gap: 12,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  fabOn: {
    backgroundColor: 'rgba(139,92,246,0.45)',
    borderColor: 'rgba(196,181,253,0.5)',
  },
  fabLock: {
    backgroundColor: 'rgba(255,42,122,0.35)',
    borderColor: 'rgba(255,180,208,0.5)',
  },
  fabGift: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff2d55',
  },
  fabEnd: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff2d55',
  },
  giftSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,10,18,0.96)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingBottom: 36,
    zIndex: 30,
    maxHeight: '50%',
  },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  sheetSub: { color: 'rgba(255,255,255,0.55)', marginTop: 6, marginBottom: 12, fontSize: 12 },
  histLine: { color: 'rgba(255,255,255,0.85)', marginBottom: 8, fontWeight: '600' },
  closeSheet: {
    color: '#9B8CFF',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '800',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  toolSheet: {
    backgroundColor: '#121826',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lockToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  lockToggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  lockToggleOn: {
    backgroundColor: 'rgba(108,124,255,0.45)',
    borderColor: '#9B8CFF',
  },
  lockToggleAdult: {
    backgroundColor: 'rgba(255,42,122,0.45)',
    borderColor: '#FF6BA8',
  },
  lockToggleText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  input: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,42,122,0.28)',
    color: '#fff',
    padding: 12,
    marginBottom: 10,
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: '#F5C14C',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#1a1200', fontWeight: '900', fontSize: 15 },
  lockThumbWrap: { marginRight: 10, width: 72 },
  lockThumb: {
    width: 72,
    height: 96,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  lockThumbCoins: {
    color: '#F5C14C',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
});
