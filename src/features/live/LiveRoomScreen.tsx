import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FlipHorizontal,
  Gift,
  Lock,
  LockOpen,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlamourGiftOverlay } from '../../components/gifts/GlamourGiftOverlay';
import { LockedRoomPaywallOverlay } from '../../components/live/LockedRoomPaywallOverlay';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { useApp } from '../../context/AppContext';
import { LIVE_FILTERS } from '../../data/liveFilters';
import { useLiveRoomLockRtm } from '../../hooks/useLiveRoomLockRtm';
import { useLiveRoomRtmEvents } from '../../hooks/useLiveRoomRtmEvents';
import {
  setAgoraBeauty,
  setAgoraBeautyIntensity,
  setAgoraCameraOff,
  setAgoraMuted,
  startAgoraLiveBroadcast,
  stopAgoraCall,
  switchAgoraCamera,
} from '../../services/agoraService';
import type { BeautyPreset } from '../../services/agoraTypes';
import { publishLiveStreamStateRtm } from '../../services/liveRoomRtmService';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';
import { LiveBroadcastSurface } from './LiveBroadcastSurface';

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

type Sheet = 'none' | 'gifts' | 'chat' | 'lock' | 'filters';

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
    stopLive,
    openRoom,
    sendComment,
    updateRoomLock,
    livePausedForCall,
    goLiveDraft,
    setGoLiveDraft,
  } = useLiveStudio();

  const roomId = route.params.roomId;
  const hostMode = Boolean(route.params.hostMode);
  const room =
    (myLiveRoom?.id === roomId ? myLiveRoom : null) ||
    liveRooms.find((r) => r.id === roomId) ||
    myLiveRoom;

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [beauty, setBeauty] = useState(
    Platform.OS === 'web' && goLiveDraft.beautyOn,
  );
  const [beautyPreset, setBeautyPreset] = useState<BeautyPreset>(
    goLiveDraft.beautyPreset,
  );
  const [beautyIntensity, setBeautyIntensity] = useState(0.82);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [cameraReady, setCameraReady] = useState(false);
  const [chatText, setChatText] = useState('');
  const [lockOn, setLockOn] = useState(Boolean(room?.entryLocked));
  const [lockFee, setLockFee] = useState(room?.entryFee || 50);
  const [lockSaving, setLockSaving] = useState(false);
  const broadcastStarted = useRef(false);

  useEffect(() => {
    openRoom(roomId);
  }, [openRoom, roomId]);

  // Sync lock state when room data arrives
  useEffect(() => {
    if (room) {
      setLockOn(Boolean(room.entryLocked));
      setLockFee(room.entryFee || 50);
    }
  }, [room?.entryLocked, room?.entryFee]);

  const startBroadcast = useCallback(async () => {
    if (!hostMode || !room?.channel || broadcastStarted.current) return;
    broadcastStarted.current = true;
    try {
      if (Platform.OS === 'web') {
        // Retry finding mount element — React may not have rendered it yet
        let mount: HTMLElement | null = null;
        for (let attempt = 0; attempt < 25; attempt++) {
          mount = document.getElementById('live-local-mount');
          if (mount) break;
          await new Promise<void>((r) => setTimeout(r, 50));
        }
        if (!mount) {
          broadcastStarted.current = false;
          notify('Live video', 'Video surface not ready — retrying');
          return;
        }
        let el = document.getElementById('live-local') as HTMLDivElement | null;
        if (!el) {
          el = document.createElement('div');
          el.id = 'live-local';
          el.style.width = '100%';
          el.style.height = '100%';
          mount.appendChild(el);
        }
        await startAgoraLiveBroadcast({
          channel: room.channel,
          localVideoEl: el,
          beauty: beauty ? beautyPreset : 'off',
        });
      } else {
        await startAgoraLiveBroadcast({
          channel: room.channel,
          beauty: beauty ? beautyPreset : 'off',
        });
      }
      await setAgoraBeauty(beauty ? beautyPreset : 'off');
      setCameraReady(true);
    } catch (e) {
      broadcastStarted.current = false;
      setCameraReady(false);
      notify('Live video', e instanceof Error ? e.message : 'Camera failed');
    }
  }, [beauty, beautyPreset, hostMode, room?.channel]);

  useEffect(() => {
    if (!hostMode || !cameraReady) return;
    void setAgoraBeauty(beauty ? beautyPreset : 'off');
    void setAgoraBeautyIntensity(beauty ? beautyIntensity : 0);
  }, [beauty, beautyIntensity, beautyPreset, cameraReady, hostMode]);

  // Let the previous preview screen fully unmount before Agora claims the
  // physical camera. This avoids a CameraView/Agora ownership race on Android.
  useEffect(() => {
    if (!hostMode || !room?.channel) return;
    if (livePausedForCall) return;
    broadcastStarted.current = false;
    const startTimer = setTimeout(
      () => void startBroadcast(),
      Platform.OS === 'web' ? 0 : 300,
    );
    return () => {
      clearTimeout(startTimer);
      broadcastStarted.current = false;
      if (livePausedForCall) return;
      void stopAgoraCall();
      if (Platform.OS === 'web') {
        document.getElementById('live-local')?.remove();
      }
      setCameraReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostMode, room?.channel, room?.id, livePausedForCall]);

  const feed = useMemo(() => {
    const giftLines = gifts.slice(0, 20).map((g) => ({
      id: `g_${g.id}`,
      text: `${g.fromName} sent ${g.giftEmoji} ${g.giftName}`,
      kind: 'gift' as const,
    }));
    const commentLines = comments
      // Gifts already have a dedicated row. The server also records a gift
      // comment for chat history, so rendering both would show every gift twice.
      .filter((c) => c.kind !== 'system' || /joined/i.test(c.text))
      .slice(-40)
      .map((c) => ({
        id: c.id,
        text:
          c.kind === 'join'
            ? `${c.userName} joined`
            : c.kind === 'system'
              ? c.text
              : `${c.userName}: ${c.text}`,
        kind: 'chat' as const,
      }));
    return [...giftLines, ...commentLines];
  }, [comments, gifts]);

  const onEnd = async () => {
    if (hostMode && room?.channel) {
      void publishLiveStreamStateRtm({
        roomId,
        channel: room.channel,
        hostId: user.id,
        muted,
        cameraOff,
        ended: true,
        reason: 'host_ended',
      });
    }
    await stopLive();
    await stopAgoraCall();
    navigation.goBack();
  };

  const onSendChat = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    Keyboard.dismiss();
    await sendComment(text);
  };

  const onSaveLock = async () => {
    if (lockSaving) return;
    const normalizedFee = lockOn
      ? Math.max(10, Math.min(9999, Math.floor(lockFee) || 50))
      : 0;
    setLockSaving(true);
    try {
      await updateRoomLock({
        entryLocked: lockOn,
        entryFee: normalizedFee,
      });
      setLockFee(normalizedFee || 50);
      setSheet('none');
      notify(
        'Room updated',
        lockOn ? `Locked · ${normalizedFee} coins` : 'Room unlocked',
      );
    } catch (error) {
      notify(
        'Lock failed',
        error instanceof Error ? error.message : 'Could not update room lock',
      );
    } finally {
      setLockSaving(false);
    }
  };

  const kickFromLockedRoom = useCallback(async () => {
    await stopAgoraCall();
  }, []);

  const onStreamState = useCallback(
    async (event: { ended?: boolean }) => {
      if (!event.ended) return;
      await stopAgoraCall();
      if (!hostMode) navigation.goBack();
    },
    [hostMode, navigation],
  );

  const lockGate = useLiveRoomLockRtm({
    roomId,
    channel: room?.channel || roomId,
    userId: user.id,
    userName: user.name || 'Viewer',
    enabled: !hostMode && Boolean(room?.channel || roomId),
    onKick: kickFromLockedRoom,
  });

  const liveRtm = useLiveRoomRtmEvents({
    roomId,
    channel: room?.channel || roomId,
    userId: user.id,
    enabled: Boolean(room?.channel || roomId),
    onStreamState,
  });

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

  const entryLocked = Boolean(room.entryLocked);
  const entryFee = room.entryFee || 0;
  const displayGiftCoins = Math.max(
    room.giftCoins || 0,
    liveRtm.stats.totalCoins || 0,
  );
  const displayViewers = Math.max(
    room.viewers || 0,
    liveRtm.stats.viewerCount || 0,
  );

  return (
    <View style={styles.root}>
      {/* Camera surface — always fullscreen background */}
      {hostMode ? (
        Platform.OS === 'web' ? (
          <div id="live-local-mount" style={webFill} />
        ) : cameraReady ? (
          <LiveBroadcastSurface cameraOff={cameraOff} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05070F' }]} />
        )
      ) : (
        <Image
          source={{ uri: room.thumbnailUrl || room.hostAvatar }}
          style={styles.cover}
          resizeMode="cover"
        />
      )}

      {hostMode && !cameraReady && (
        <View style={styles.openingCam}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Opening camera…</Text>
        </View>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.78)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top HUD */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.hostChip}>
          <Image source={{ uri: room.hostAvatar }} style={styles.hostAv} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.hostName} numberOfLines={1}>
              {room.hostName}
            </Text>
            <Text style={styles.timer}>{formatLive(hostMode ? liveSeconds : 0)}</Text>
          </View>
          <View style={[styles.livePill, livePausedForCall && styles.livePillCall]}>
            <Text style={styles.livePillText}>
              {livePausedForCall ? 'CALL' : 'LIVE'}
            </Text>
          </View>
          {entryLocked && entryFee > 0 && (
            <View style={styles.lockPill}>
              <Text style={styles.lockPillText}>🔒 {entryFee}</Text>
            </View>
          )}
        </View>
        <View style={styles.topRight}>
          <View style={styles.statPill}>
            <Text style={styles.statText}>💎 {displayGiftCoins}</Text>
          </View>
          <View style={styles.statPill}>
            <Users size={13} color="#fff" />
            <Text style={styles.statText}>{displayViewers}</Text>
          </View>
          <Pressable
            onPress={hostMode ? () => void onEnd() : () => navigation.goBack()}
            style={styles.closeBtn}
          >
            <X size={16} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Chat feed */}
      <View style={[styles.feed, { bottom: insets.bottom + 76 }]}>
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

      {/* Gift overlay */}
      {giftOverlay && (
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
      )}

      {/* Host controls — compact right column */}
      {hostMode && (
        <View style={[styles.fabColumn, { paddingBottom: insets.bottom + 16 }]}>
          <Fab
            icon={muted ? MicOff : Mic}
            onPress={async () => {
              const next = !muted;
              setMuted(next);
              await setAgoraMuted(next);
              void publishLiveStreamStateRtm({
                roomId,
                channel: room.channel,
                hostId: user.id,
                muted: next,
                cameraOff,
              });
            }}
          />
          <Fab
            icon={cameraOff ? VideoOff : Video}
            onPress={async () => {
              const next = !cameraOff;
              setCameraOff(next);
              await setAgoraCameraOff(next);
              void publishLiveStreamStateRtm({
                roomId,
                channel: room.channel,
                hostId: user.id,
                muted,
                cameraOff: next,
              });
            }}
          />
          <Fab icon={FlipHorizontal} onPress={() => void switchAgoraCamera()} />
          {Platform.OS === 'web' ? (
            <Fab
              icon={Sparkles}
              active={beauty}
              onPress={() => setSheet(sheet === 'filters' ? 'none' : 'filters')}
            />
          ) : null}
          <Fab
            icon={entryLocked ? Lock : LockOpen}
            active={entryLocked}
            tint={entryLocked ? '#F5C14C' : undefined}
            onPress={() => setSheet(sheet === 'lock' ? 'none' : 'lock')}
          />
          <Fab
            icon={MessageSquare}
            onPress={() => setSheet(sheet === 'chat' ? 'none' : 'chat')}
          />
          <Fab
            icon={Gift}
            tint="#F5C14C"
            onPress={() => setSheet(sheet === 'gifts' ? 'none' : 'gifts')}
          />
          <Pressable style={styles.fabEnd} onPress={() => void onEnd()}>
            <X size={20} color="#fff" />
          </Pressable>
        </View>
      )}

      {!hostMode && (
        <View style={[styles.fabColumn, { paddingBottom: insets.bottom + 16 }]}>
          <Fab
            icon={Gift}
            tint="#F5C14C"
            onPress={() => setSheet(sheet === 'gifts' ? 'none' : 'gifts')}
          />
        </View>
      )}

      {/* Bottom chat bar for host */}
      {hostMode && sheet === 'none' && (
        <View style={[styles.chatBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.chatInput}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Say something to viewers…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            onSubmitEditing={() => void onSendChat()}
            returnKeyType="send"
          />
          <Pressable onPress={() => void onSendChat()} style={styles.sendBtn}>
            <Send size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Gift sheet */}
      {sheet === 'gifts' && (
        <BottomSheet onClose={() => setSheet('none')} title="Recent gifts">
          {gifts.length === 0 ? (
            <Text style={styles.sheetSub}>No gifts yet</Text>
          ) : (
            gifts.slice(0, 12).map((g) => (
              <View key={g.id} style={styles.giftRow}>
                <Text style={styles.giftEmoji}>{g.giftEmoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.giftSender} numberOfLines={1}>{g.fromName}</Text>
                  <Text style={styles.giftName} numberOfLines={1}>{g.giftName}</Text>
                </View>
                <Text style={styles.giftCoins}>+{g.coins}</Text>
              </View>
            ))
          )}
        </BottomSheet>
      )}

      {/* Chat sheet */}
      {sheet === 'chat' && (
        <BottomSheet onClose={() => setSheet('none')} title="Chat">
          <View style={styles.chatSheet}>
            {comments.slice(-20).map((c) => (
              <Text key={c.id} style={styles.chatLine} numberOfLines={2}>
                <Text style={styles.chatUser}>{c.userName}: </Text>
                {c.text}
              </Text>
            ))}
          </View>
          <View style={styles.sheetChatBar}>
            <TextInput
              style={styles.sheetChatInput}
              value={chatText}
              onChangeText={setChatText}
              placeholder="Reply…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              onSubmitEditing={() => void onSendChat()}
              returnKeyType="send"
            />
            <Pressable onPress={() => void onSendChat()} style={styles.sendBtn}>
              <Send size={16} color="#fff" />
            </Pressable>
          </View>
        </BottomSheet>
      )}

      {/* Lock sheet */}
      {sheet === 'lock' && (
        <BottomSheet onClose={() => setSheet('none')} title="Room lock">
          <View style={styles.lockRow}>
            <Text style={[styles.lockLabel, { color: lockOn ? '#F5C14C' : 'rgba(255,255,255,0.7)' }]}>
              {lockOn ? '🔒 Locked' : '🔓 Open'}
            </Text>
            <Switch
              value={lockOn}
              onValueChange={setLockOn}
              trackColor={{ false: '#334155', true: '#F5C14C' }}
              thumbColor="#fff"
            />
          </View>
          {lockOn && (
            <>
              <Text style={styles.feeLabel}>Entry fee (coins)</Text>
              <View style={styles.presetRow}>
                {[50, 100, 500, 1000, 5000].map((fee) => (
                  <Pressable
                    key={fee}
                    onPress={() => setLockFee(fee)}
                    style={[styles.presetChip, lockFee === fee && styles.presetChipOn]}
                  >
                    <Text style={[styles.presetText, lockFee === fee && styles.presetTextOn]}>
                      {fee >= 1000 ? `${fee / 1000}k` : fee}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={String(lockFee)}
                onChangeText={(value) => {
                  const fee = Number(value.replace(/\D/g, ''));
                  setLockFee(Number.isFinite(fee) ? Math.min(9999, fee) : 0);
                }}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="Custom fee (10–9999 coins)"
                placeholderTextColor="rgba(255,255,255,0.38)"
                style={styles.feeInput}
              />
            </>
          )}
          <Pressable
            style={[styles.saveBtn, lockSaving && { opacity: 0.55 }]}
            disabled={lockSaving}
            onPress={() => void onSaveLock()}
          >
            <Text style={styles.saveBtnText}>
              {lockSaving ? 'Applying…' : 'Apply'}
            </Text>
          </Pressable>
        </BottomSheet>
      )}

      {/* Filter sheet */}
      {Platform.OS === 'web' && sheet === 'filters' && (
        <BottomSheet onClose={() => setSheet('none')} title="Live Beauty Studio">
          <View style={styles.filterHead}>
            <Text style={styles.filterHint}>
              Browser beauty effects update without stopping your live stream.
            </Text>
            <Switch
              value={beauty}
              onValueChange={(next) => {
                setBeauty(next);
                setGoLiveDraft({ beautyOn: next });
              }}
              trackColor={{ false: '#334155', true: '#A78BFA' }}
              thumbColor="#fff"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroller}
          >
            {LIVE_FILTERS.map((filter) => {
              const on = beauty && beautyPreset === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => {
                    setBeauty(true);
                    setBeautyPreset(filter.id);
                    setGoLiveDraft({ beautyOn: true, beautyPreset: filter.id });
                    void setAgoraBeauty(filter.id);
                    void setAgoraBeautyIntensity(beautyIntensity);
                  }}
                  style={[styles.filterCard, on && styles.filterCardOn]}
                >
                  <Text style={styles.filterIcon}>{filter.icon}</Text>
                  <Text style={[styles.filterName, on && styles.filterNameOn]}>
                    {filter.shortLabel}
                  </Text>
                  <Text style={styles.filterDesc} numberOfLines={2}>
                    {filter.description}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <BeautyIntensitySlider
            value={beautyIntensity}
            disabled={!beauty}
            onChange={(next) => {
              setBeautyIntensity(next);
              void setAgoraBeautyIntensity(next);
            }}
          />
          <Text style={styles.filterPathHint} numberOfLines={2}>
            Beauty processing is available in the browser studio.
          </Text>
        </BottomSheet>
      )}

      {!hostMode && (
        <LockedRoomPaywallOverlay
          visible={lockGate.locked}
          entryFee={lockGate.entryFee || entryFee}
          balance={user.coinBalance}
          paying={lockGate.paying}
          error={lockGate.error}
          onPay={() => void lockGate.pay()}
          onDecline={() => {
            void lockGate.decline();
            navigation.goBack();
          }}
        />
      )}
    </View>
  );
}

function BeautyIntensitySlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const barWidth = useRef(1);
  const update = useCallback(
    (x: number) => {
      if (disabled) return;
      const next = Math.max(0, Math.min(1, x / barWidth.current));
      onChange(Number(next.toFixed(2)));
    },
    [disabled, onChange],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => update(event.nativeEvent.locationX),
        onPanResponderMove: (event) => update(event.nativeEvent.locationX),
      }),
    [disabled, update],
  );
  return (
    <View style={[styles.sliderBox, disabled && styles.sliderBoxOff]}>
      <View style={styles.sliderLabelRow}>
        <Text style={styles.sliderLabel}>Skin smoothing / whitening intensity</Text>
        <Text style={styles.sliderValue}>{Math.round(value * 100)}%</Text>
      </View>
      <View
        style={styles.sliderTrack}
        onLayout={(event) => {
          barWidth.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        {...panResponder.panHandlers}
      >
        <View style={[styles.sliderFill, { width: `${Math.round(value * 100)}%` }]} />
        <View style={[styles.sliderThumb, { left: `${Math.round(value * 100)}%` }]} />
      </View>
    </View>
  );
}

function Fab({
  icon: Icon,
  onPress,
  active,
  tint,
}: {
  icon: any;
  onPress: () => void;
  active?: boolean;
  tint?: string;
}) {
  return (
    <Pressable style={[styles.fab, active && styles.fabActive]} onPress={onPress}>
      <Icon size={20} color={tint || '#fff'} />
    </Pressable>
  );
}

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <X size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>
      {children}
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
  cover: { ...StyleSheet.absoluteFill },
  openingCam: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 5,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    zIndex: 20,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    maxWidth: '65%',
  },
  hostAv: { width: 30, height: 30, borderRadius: 15 },
  hostName: { color: '#fff', fontWeight: '800', fontSize: 12 },
  timer: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  livePill: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  livePillCall: { backgroundColor: '#7C3AED' },
  livePillText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  lockPill: {
    backgroundColor: 'rgba(245,193,76,0.22)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,193,76,0.45)',
  },
  lockPillText: { color: '#F5C14C', fontSize: 9, fontWeight: '900' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feed: {
    position: 'absolute',
    left: 10,
    right: 72,
    maxHeight: 200,
    zIndex: 20,
  },
  feedRow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 2,
    paddingVertical: 2,
    marginBottom: 3,
  },
  feedGift: {
    backgroundColor: 'rgba(123,44,255,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
  },
  feedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedEmpty: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 8 },
  fabColumn: {
    position: 'absolute',
    right: 10,
    bottom: 0,
    zIndex: 20,
    alignItems: 'center',
    gap: 10,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  fabActive: { backgroundColor: 'rgba(139,92,246,0.55)' },
  fabEnd: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E11D48',
  },
  chatBar: {
    position: 'absolute',
    left: 10,
    right: 68,
    bottom: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 13,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,77,141,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,8,20,0.97)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    zIndex: 30,
    maxHeight: '52%',
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sheetSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 8 },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  giftEmoji: { fontSize: 24 },
  giftSender: { color: '#fff', fontWeight: '700', fontSize: 13 },
  giftName: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
  giftCoins: { color: '#F5C14C', fontWeight: '900', fontSize: 13 },
  chatSheet: { maxHeight: 220 },
  chatLine: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginBottom: 6 },
  chatUser: { fontWeight: '800', color: '#fff' },
  sheetChatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  sheetChatInput: {
    flex: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  lockLabel: { fontWeight: '800', fontSize: 15 },
  feeLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 52,
    alignItems: 'center',
  },
  presetChipOn: {
    backgroundColor: 'rgba(245,193,76,0.18)',
    borderColor: '#F5C14C',
  },
  presetText: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 14 },
  presetTextOn: { color: '#F5C14C' },
  feeInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  filterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  filterHint: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  filterScroller: {
    gap: 10,
    paddingRight: 16,
    paddingBottom: 4,
  },
  filterCard: {
    width: 112,
    minHeight: 118,
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#A78BFA',
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  filterCardOn: {
    backgroundColor: 'rgba(167,139,250,0.24)',
    borderColor: '#C4B5FD',
  },
  filterIcon: { fontSize: 23, marginBottom: 8 },
  filterName: { color: '#fff', fontWeight: '900', fontSize: 12, lineHeight: 14 },
  filterNameOn: { color: '#F8FAFC' },
  filterDesc: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 10,
    lineHeight: 13,
    marginTop: 4,
  },
  filterPathHint: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 10,
    lineHeight: 13,
    marginTop: 10,
  },
  sliderBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sliderBoxOff: { opacity: 0.45 },
  sliderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sliderLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sliderValue: { color: '#F5C14C', fontSize: 12, fontWeight: '900' },
  sliderTrack: {
    height: 28,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'visible',
  },
  sliderFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#C4B5FD',
  },
  sliderThumb: {
    position: 'absolute',
    top: 4,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#A78BFA',
  },
  saveBtn: {
    backgroundColor: '#FF4D8D',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
