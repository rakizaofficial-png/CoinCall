import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  Headphones,
  Lock,
  Megaphone,
  Pin,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import {
  fetchActiveUsers,
  fetchRechargeBoard,
  massTextAllActiveUsers,
  type ActiveUserRow,
  type RechargeEvent,
} from '../../services/hostOutreachService';
import {
  fetchDmThreadsForHost,
  type DmThreadRow,
} from '../../services/chatService';
import {
  listenHostNotifications,
  pushHostNotification,
  type InboxNotification,
} from '../../services/notificationInboxService';
import { tabScreenBottomPad } from '../../navigation/layout';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

function formatTime(ts: number) {
  if (!ts) return '';
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const today = new Date();
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return `${hh}:${mi}`;
  }
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** Always-pinned WhatsApp-style official chats */
const PINNED = [
  {
    key: 'support',
    title: 'Customer Support',
    body: 'Help Center · tickets · admin chat',
    color: '#3B82F6',
    Icon: Headphones,
    verified: true,
    screen: 'HelpCenter' as const,
    chat: {
      peerId: 'admin_support',
      peerName: 'Customer Support',
      peerAvatar: '',
    },
  },
  {
    key: 'system',
    title: 'System Information',
    body: 'FAQ · App info · Report · Legal',
    color: '#A855F7',
    Icon: Bell,
    verified: true,
    screen: 'SystemInformation' as const,
    chat: {
      peerId: 'system_info',
      peerName: 'System Information',
      peerAvatar: '',
    },
  },
];

export function ChatHubScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { user: authUser } = useAuth();
  const hostId = authUser?.id || user.id;
  const { rechargeUsers } = useLiveStudio();

  const [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [, setRechargeEvents] = useState<RechargeEvent[]>([]);
  const [dmThreads, setDmThreads] = useState<DmThreadRow[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [activeFans, setActiveFans] = useState<ActiveUserRow[]>([]);
  const [massOpen, setMassOpen] = useState(false);
  const [massText, setMassText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  // Track when each thread was last opened to show unread badge
  const [seenAt, setSeenAt] = useState<Record<string, number>>({});

  useEffect(() => {
    return listenHostNotifications(hostId, setInbox);
  }, [hostId]);

  useEffect(() => {
    const load = () => {
      void fetchRechargeBoard().then((b) => setRechargeEvents(b.events || []));
      void fetchActiveUsers().then((u) => {
        const fans = u.filter((row) => row.role === 'user');
        setActiveCount(fans.length);
        setActiveFans(fans.slice(0, 24));
      });
      void fetchDmThreadsForHost(hostId).then(setDmThreads);
    };
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [hostId]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../../services/realtimeWs').then(({ subscribeRealtime }) => {
      unsub = subscribeRealtime((event) => {
        if (event.type === 'dm:message') {
          void fetchDmThreadsForHost(hostId).then(setDmThreads);
          const p = event.payload as {
            message?: { fromName?: string; text?: string; fromId?: string };
            thread?: { hostId?: string };
          };
          if (p?.thread?.hostId && p.thread.hostId !== hostId) return;
          if (p?.message?.text) {
            void pushHostNotification(hostId, {
              type: 'chat',
              title: 'New message',
              body: `${p.message.fromName || 'Fan'}: ${String(p.message.text).slice(0, 80)}`,
              fromId: p.message.fromId,
            });
          }
          return;
        }
        if (event.type === 'recharge:updated') {
          const p = event.payload as { event?: RechargeEvent };
          if (p?.event) {
            setRechargeEvents((prev) => [p.event!, ...prev].slice(0, 50));
            void pushHostNotification(hostId, {
              type: 'recharge',
              title: 'Wallet recharge',
              body: `ID ${p.event.userId} user, recharge ${p.event.coins} coins`,
              fromId: p.event.userId,
            });
          }
        }
      });
    });
    return () => unsub?.();
  }, [hostId]);

  const adminUnread = inbox.filter(
    (i) => (i.type === 'support' || i.type === 'admin') && !i.read,
  ).length;

  const sendMass = async () => {
    const text = massText.trim();
    if (!text) {
      notify('Mass texting', 'Write a message first');
      return;
    }
    setSending(true);
    try {
      const sent = await massTextAllActiveUsers({
        hostId,
        hostName: user.name,
        text,
      });
      setLastSent(sent);
      setMassText('');
      await pushHostNotification(hostId, {
        type: 'mass',
        title: 'Mass texting',
        body: `Sent to ${sent} users: ${text.slice(0, 60)}`,
      });
      notify('Mass texting sent', `Delivered to ${sent} users`);
      setMassOpen(false);
    } catch (e) {
      notify('Mass texting failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  const massBadge = Math.max(activeCount, rechargeUsers.length, lastSent || 0, 1);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <LinearGradient
        colors={['#1a0a2e', colors.bg, '#070A14']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Text style={[styles.pageTitle, { color: colors.text }]}>Chats</Text>

      {/* Pinned — cannot move */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
        <Pin size={11} color={colors.textMuted} /> Pinned
      </Text>
      {PINNED.map((row, index) => (
        <Animated.View key={row.key} entering={FadeInDown.delay(index * 60).springify()}>
          <Pressable
            onPress={() => {
              navigation.navigate('DirectChat', row.chat);
            }}
            onLongPress={() => navigation.navigate(row.screen)}
            style={[styles.row, styles.pinnedRow]}
          >
            <View style={[styles.iconOrb, { backgroundColor: row.color }]}>
              <row.Icon size={22} color="#fff" />
              <View style={styles.lockBadge}>
                <Lock size={8} color="#fff" />
              </View>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <View style={styles.titleRow}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
                  {row.verified ? <ShieldCheck size={14} color="#3B82F6" /> : null}
                  <Pin size={12} color="rgba(255,255,255,0.35)" />
                </View>
                <Text style={styles.rowTime}>{formatTime(Date.now())}</Text>
              </View>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {row.body}
              </Text>
            </View>
            {row.key === 'support' && adminUnread ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {adminUnread > 99 ? '99+' : adminUnread}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      ))}

      {activeFans.length > 0 ? (
        <View style={{ marginBottom: 10, marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            Active fans
          </Text>
          <FlatList
            horizontal
            data={activeFans}
            keyExtractor={(u) => u.userId}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 2, paddingBottom: 6 }}
            renderItem={({ item }) => {
              const photo =
                item.avatarUrl ||
                `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(item.userId)}&size=128`;
              return (
                <Pressable
                  onPress={() =>
                    navigation.navigate('FanProfile', {
                      userId: item.userId,
                      userName: item.userName,
                      avatarUrl: item.avatarUrl,
                    })
                  }
                  style={styles.fanChip}
                >
                  <Image source={{ uri: photo }} style={styles.fanChipAvatar} />
                  <Text style={[styles.fanChipName, { color: colors.text }]} numberOfLines={1}>
                    {item.userName}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 4 }]}>
        Messages
      </Text>

      <View style={[styles.list, { paddingBottom: tabScreenBottomPad(insets.bottom) + 72 }]}>
        {dmThreads.length > 0 ? (
          dmThreads.slice(0, 40).map((t) => {
            const photo =
              t.userAvatar ||
              `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(t.userId)}&size=128`;
            const isUnread = Boolean(t.lastMessage) && (!seenAt[t.id] || t.updatedAt > seenAt[t.id]);
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  setSeenAt((s) => ({ ...s, [t.id]: Date.now() }));
                  navigation.navigate('DirectChat', {
                    peerId: t.userId,
                    peerName: t.userName,
                    peerAvatar: t.userAvatar || photo,
                  });
                }}
                style={[styles.row, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}
              >
                <View style={styles.avatarWrap}>
                  <Image source={{ uri: photo }} style={styles.threadAvatar} />
                  {isUnread && <View style={styles.unreadDot} />}
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: colors.text },
                        isUnread && styles.rowTitleUnread,
                      ]}
                    >
                      {t.userName || 'Fan'}
                    </Text>
                    <Text style={styles.rowTime}>{formatTime(t.updatedAt)}</Text>
                  </View>
                  <Text
                    style={[styles.rowPreview, isUnread && styles.rowPreviewUnread]}
                    numberOfLines={1}
                  >
                    {t.lastMessage}
                  </Text>
                </View>
                {isUnread && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>1</Text>
                  </View>
                )}
              </Pressable>
            );
          })
        ) : (
          <Text style={[styles.emptyFans, { color: colors.textMuted }]}>
            Fan messages from Luma appear here.
          </Text>
        )}
      </View>

      <Pressable
        style={[styles.fabWrap, { bottom: tabScreenBottomPad(insets.bottom) }]}
        onPress={() => setMassOpen(true)}
      >
        <LinearGradient colors={['#FF4D8D', '#FF2A7A', '#C026D3']} style={styles.fab}>
          <Megaphone size={28} color="#fff" />
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{massBadge > 99 ? '99+' : massBadge}</Text>
          </View>
        </LinearGradient>
        <Text style={styles.fabLabel}>Mass Texting</Text>
      </Pressable>

      <Modal visible={massOpen} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Mass Texting</Text>
              <Pressable onPress={() => setMassOpen(false)} hitSlop={10}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>
              Send one message to active users only
              {activeCount ? ` · ${activeCount} online` : ' · none online'}
            </Text>
            <TextInput
              style={styles.massInput}
              value={massText}
              onChangeText={setMassText}
              placeholder="Write your mass message…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline
              maxLength={500}
            />
            <Pressable
              style={[styles.sendMass, sending && { opacity: 0.6 }]}
              disabled={sending}
              onPress={() => void sendMass()}
            >
              <Megaphone size={18} color="#1a1200" />
              <Text style={styles.sendMassText}>
                {sending ? 'Sending…' : 'Send to all users'}
              </Text>
            </Pressable>
            {lastSent != null ? (
              <Text style={styles.sentHint}>Last send reached {lastSent} users ✓</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  pageTitle: { fontSize: 28, fontWeight: '900', marginBottom: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 4,
  },
  emptyFans: { fontSize: 12, marginBottom: 12, opacity: 0.8 },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  pinnedRow: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  iconOrb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  avatarWrap: { position: 'relative' },
  threadAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  unreadDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#070A14',
  },
  rowTitleUnread: { fontWeight: '900' },
  rowPreviewUnread: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  fanChip: { width: 76, alignItems: 'center' },
  fanChipAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'rgba(255,77,109,0.45)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fanChipName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    width: 76,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: { fontWeight: '800', fontSize: 16 },
  rowTime: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  rowPreview: { color: 'rgba(255,255,255,0.55)', marginTop: 4, fontSize: 13 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  fabWrap: {
    position: 'absolute',
    right: 18,
    alignItems: 'center',
    zIndex: 20,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,182,220,0.8)',
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  fabBadgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  fabLabel: {
    marginTop: 6,
    color: '#F5C14C',
    fontWeight: '900',
    fontSize: 12,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
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
  sheetTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
  sheetSub: { color: 'rgba(255,255,255,0.55)', marginTop: 6, marginBottom: 12, fontSize: 12 },
  massInput: {
    minHeight: 120,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,42,122,0.35)',
    color: '#fff',
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  sendMass: {
    marginTop: 14,
    backgroundColor: '#F5C14C',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendMassText: { color: '#1a1200', fontWeight: '900', fontSize: 15 },
  sentHint: { color: '#34D399', textAlign: 'center', marginTop: 10, fontWeight: '700' },
});
