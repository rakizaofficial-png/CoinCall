import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  Headphones,
  Mail,
  Megaphone,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import {
  fetchActiveUsers,
  fetchRechargeBoard,
  massTextAllActiveUsers,
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

export function ChatHubScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { contactAdminSupport, rechargeUsers } = useLiveStudio();

  const [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [rechargeEvents, setRechargeEvents] = useState<RechargeEvent[]>([]);
  const [dmThreads, setDmThreads] = useState<DmThreadRow[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [massOpen, setMassOpen] = useState(false);
  const [massText, setMassText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);

  useEffect(() => {
    return listenHostNotifications(user.id, setInbox);
  }, [user.id]);

  useEffect(() => {
    const load = () => {
      void fetchRechargeBoard().then((b) => setRechargeEvents(b.events || []));
      void fetchActiveUsers().then((u) => setActiveCount(u.length));
      void fetchDmThreadsForHost(user.id).then(setDmThreads);
    };
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [user.id]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../../services/realtimeWs').then(({ subscribeRealtime }) => {
      unsub = subscribeRealtime((event) => {
        if (event.type === 'dm:message') {
          void fetchDmThreadsForHost(user.id).then(setDmThreads);
          const p = event.payload as {
            message?: { fromName?: string; text?: string; fromId?: string };
            thread?: { hostId?: string };
          };
          if (p?.thread?.hostId && p.thread.hostId !== user.id) return;
          if (p?.message?.text) {
            void pushHostNotification(user.id, {
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
            void pushHostNotification(user.id, {
              type: 'recharge',
              title: 'System information',
              body: `ID ${p.event.userId} user, recharge ${p.event.coins} coins`,
              fromId: p.event.userId,
            });
          }
        }
      });
    });
    return () => unsub?.();
  }, [user.id]);

  const systemUnread = useMemo(() => {
    const fromInbox = inbox.filter((i) => i.type === 'recharge' && !i.read).length;
    return Math.max(fromInbox, rechargeEvents.length ? Math.min(rechargeEvents.length, 99) : 0);
  }, [inbox, rechargeEvents]);

  const adminUnread = inbox.filter(
    (i) => (i.type === 'support' || i.type === 'admin') && !i.read,
  ).length;
  const stationUnread = inbox.filter(
    (i) => i.type === 'live' || i.type === 'room' || i.type === 'station',
  ).length;

  const latestSystem =
    rechargeEvents[0] ||
    inbox.find((i) => i.type === 'recharge') ||
    null;

  const systemPreview = latestSystem
    ? 'userId' in latestSystem && 'coins' in latestSystem
      ? `ID ${latestSystem.userId} user, recharge ${latestSystem.coins} coins`
      : (latestSystem as InboxNotification).body
    : 'No recharges yet';

  const adminPreview =
    inbox.find((i) => i.type === 'support' || i.type === 'admin')?.body ||
    'Hi, Welcome to CoinCall';

  const sendMass = async () => {
    const text = massText.trim();
    if (!text) {
      notify('Mass texting', 'Write a message first');
      return;
    }
    setSending(true);
    try {
      const sent = await massTextAllActiveUsers({
        hostId: user.id,
        hostName: user.name,
        text,
      });
      setLastSent(sent);
      setMassText('');
      await pushHostNotification(user.id, {
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

  const rows = [
    {
      key: 'station',
      title: 'Station information',
      body: '⚽ Live streamer ranking & room updates',
      time: formatTime(Date.now()),
      badge: stationUnread || undefined,
      color: '#22C55E',
      Icon: Mail,
      onPress: () => navigation.navigate('Notifications'),
    },
    {
      key: 'system',
      title: 'System information',
      body: systemPreview,
      time: formatTime(
        rechargeEvents[0]?.at ||
          inbox.find((i) => i.type === 'recharge')?.createdAt ||
          Date.now(),
      ),
      badge: systemUnread || undefined,
      color: '#A855F7',
      Icon: Bell,
      onPress: () => setSystemOpen(true),
    },
    {
      key: 'admin',
      title: 'Administrator',
      body: adminPreview,
      time: formatTime(
        inbox.find((i) => i.type === 'support' || i.type === 'admin')?.createdAt ||
          Date.now(),
      ),
      badge: adminUnread || 1,
      color: '#3B82F6',
      Icon: Headphones,
      onPress: () => {
        void contactAdminSupport('Hello admin, I need help');
        notify('Administrator', 'Support ticket opened');
      },
    },
  ];

  const massBadge = Math.max(activeCount, rechargeUsers.length, lastSent || 0, 1);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <LinearGradient
        colors={['#1a0a2e', colors.bg, '#070A14']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Text style={[styles.pageTitle, { color: colors.text }]}>Messages</Text>

      {dmThreads.length > 0 ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Fan chats</Text>
          {dmThreads.slice(0, 20).map((t) => (
            <Pressable
              key={t.id}
              onPress={() =>
                navigation.navigate('Chat', {
                  peerId: t.userId,
                  peerName: t.userName,
                  peerAvatar: t.userAvatar,
                })
              }
              style={[styles.row, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}
            >
              <View style={[styles.iconOrb, { backgroundColor: '#F59E0B' }]}>
                <Text style={{ color: '#fff', fontWeight: '900' }}>
                  {(t.userName || 'F').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    {t.userName || 'Fan'}
                  </Text>
                  <Text style={styles.rowTime}>{formatTime(t.updatedAt)}</Text>
                </View>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {t.lastMessage}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyFans, { color: colors.textMuted }]}>
          Fan messages from Luma appear here.
        </Text>
      )}

      <View style={styles.list}>
        {rows.map((row) => (
          <Pressable
            key={row.key}
            onPress={row.onPress}
            style={[styles.row, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}
          >
            <View style={[styles.iconOrb, { backgroundColor: row.color }]}>
              <row.Icon size={22} color="#fff" />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
                <Text style={styles.rowTime}>{row.time}</Text>
              </View>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {row.body}
              </Text>
            </View>
            {row.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {row.badge > 99 ? '99+' : row.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* Floating Mass Texting (like reference) */}
      <Pressable
        style={[styles.fabWrap, { bottom: insets.bottom + 88 }]}
        onPress={() => setMassOpen(true)}
      >
        <LinearGradient
          colors={['#FF4D8D', '#FF2A7A', '#C026D3']}
          style={styles.fab}
        >
          <Megaphone size={28} color="#fff" />
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{massBadge > 99 ? '99+' : massBadge}</Text>
          </View>
        </LinearGradient>
        <Text style={styles.fabLabel}>Mass Texting</Text>
      </Pressable>

      {/* Mass texting composer */}
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
              Send one message to all active users
              {activeCount ? ` · ${activeCount} online` : ''}
              {rechargeUsers.length ? ` · ${rechargeUsers.length} rechargers` : ''}
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

      {/* System recharge list */}
      <Modal visible={systemOpen} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '70%' }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>System information</Text>
              <Pressable onPress={() => setSystemOpen(false)} hitSlop={10}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>User ID + recharge coins · updates every time</Text>
            <FlatList
              data={rechargeEvents}
              keyExtractor={(e) => e.id}
              ListEmptyComponent={
                <Text style={styles.sheetSub}>No recharges yet — demo from live room</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.rechargeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rechargeId}>ID {item.userId}</Text>
                    <Text style={styles.rechargeName}>{item.userName}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.rechargeCoins}>+{item.coins}</Text>
                    <Text style={styles.rechargeTotal}>total {item.totalCoins}</Text>
                    <Text style={styles.rowTime}>{formatTime(item.at)}</Text>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  pageTitle: { fontSize: 28, fontWeight: '900', marginBottom: 12 },
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
    gap: 12,
  },
  iconOrb: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
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
    textShadowColor: 'rgba(255,42,122,0.6)',
    textShadowRadius: 6,
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
  rechargeRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  rechargeId: { color: '#F5C14C', fontWeight: '800', fontSize: 13 },
  rechargeName: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  rechargeCoins: { color: '#fff', fontWeight: '900', fontSize: 16 },
  rechargeTotal: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },
});
