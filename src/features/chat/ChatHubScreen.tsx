import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  BookOpen,
  Circle,
  Headphones,
  Mail,
  Megaphone,
  MessageCircle,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import {
  fetchActiveUsers,
  fetchHelpCenterArticles,
  fetchHostSupportTickets,
  fetchRechargeBoard,
  massTextAllActiveUsers,
  type ActiveUserRow,
  type HelpArticle,
  type HostSupportTicket,
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

const SUPPORT_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'live', label: 'Live / Lock' },
  { id: 'gifts', label: 'Gifts / Adult' },
  { id: 'android', label: 'Android' },
  { id: 'wallet', label: 'Wallet' },
] as const;

export function ChatHubScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { user: authUser } = useAuth();
  const hostId = authUser?.id || user.id;
  const { contactAdminSupport, rechargeUsers } = useLiveStudio();

  const [inbox, setInbox] = useState<InboxNotification[]>([]);
  const [rechargeEvents, setRechargeEvents] = useState<RechargeEvent[]>([]);
  const [dmThreads, setDmThreads] = useState<DmThreadRow[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [activeFans, setActiveFans] = useState<ActiveUserRow[]>([]);
  const [massOpen, setMassOpen] = useState(false);
  const [massText, setMassText] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<'articles' | 'ticket' | 'mine'>('articles');
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [tickets, setTickets] = useState<HostSupportTicket[]>([]);
  const [supportText, setSupportText] = useState('');
  const [supportCategory, setSupportCategory] = useState<string>('general');
  const [supportBusy, setSupportBusy] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  useEffect(() => {
    return listenHostNotifications(hostId, setInbox);
  }, [hostId]);

  useEffect(() => {
    const load = () => {
      void fetchRechargeBoard().then((b) => setRechargeEvents(b.events || []));
      void fetchActiveUsers().then((u) => {
        const fans = u.filter((row) => row.role === 'user');
        setActiveCount(fans.length);
        setActiveFans(fans.slice(0, 40));
      });
      void fetchDmThreadsForHost(hostId).then(setDmThreads);
    };
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [hostId]);

  useEffect(() => {
    if (!helpOpen) return;
    void fetchHelpCenterArticles().then(setArticles);
    void fetchHostSupportTickets(hostId).then(setTickets);
  }, [helpOpen, hostId]);

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
              title: 'System information',
              body: `ID ${p.event.userId} user, recharge ${p.event.coins} coins`,
              fromId: p.event.userId,
            });
          }
        }
      });
    });
    return () => unsub?.();
  }, [hostId]);

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
    'Help Center · tickets · Android tips';

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

  const submitSupport = async () => {
    const text = supportText.trim();
    if (!text) {
      notify('Help Center', 'Describe your issue');
      return;
    }
    setSupportBusy(true);
    try {
      await contactAdminSupport(text, supportCategory);
      setSupportText('');
      notify('Ticket sent', 'Admin Help Center will reply soon');
      setHelpTab('mine');
      void fetchHostSupportTickets(hostId).then(setTickets);
    } catch (e) {
      notify('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSupportBusy(false);
    }
  };

  const rows = [
    {
      key: 'station',
      title: 'Station information',
      body: 'Live ranking & room updates',
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
      title: 'Help Center',
      body: adminPreview,
      time: formatTime(
        inbox.find((i) => i.type === 'support' || i.type === 'admin')?.createdAt ||
          Date.now(),
      ),
      badge: adminUnread || undefined,
      color: '#3B82F6',
      Icon: Headphones,
      onPress: () => {
        setHelpOpen(true);
        setHelpTab('articles');
      },
    },
  ];

  const massBadge = Math.max(activeCount, rechargeUsers.length, lastSent || 0, 1);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <LinearGradient
        colors={['#121a2e', colors.bg, '#070A14']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.titleRow}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Messages</Text>
        <View style={styles.onlinePill}>
          <Circle size={8} color="#34D399" fill="#34D399" />
          <Text style={styles.onlinePillText}>
            {activeCount} online
          </Text>
        </View>
      </View>

      <View style={styles.onlineCard}>
        <View style={styles.onlineHead}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 0 }]}>
            See users online
          </Text>
          <Pressable onPress={() => setMassOpen(true)}>
            <Text style={styles.setMsgLink}>Set message</Text>
          </Pressable>
        </View>
        {activeFans.length > 0 ? (
          <FlatList
            horizontal
            data={activeFans}
            keyExtractor={(u) => u.userId}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingTop: 10, paddingBottom: 4 }}
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
                  <View>
                    <Image source={{ uri: photo }} style={styles.fanChipAvatar} />
                    <View style={styles.onlineDot} />
                  </View>
                  <Text style={[styles.fanChipName, { color: colors.text }]} numberOfLines={1}>
                    {item.userName}
                  </Text>
                  <Pressable
                    style={styles.dmMini}
                    onPress={() =>
                      navigation.navigate('DirectChat', {
                        peerId: item.userId,
                        peerName: item.userName,
                        peerAvatar: item.avatarUrl || photo,
                      })
                    }
                  >
                    <MessageCircle size={12} color="#1a1200" />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        ) : (
          <Text style={[styles.emptyFans, { color: colors.textMuted }]}>
            No fans online right now — stay available for 1:1
          </Text>
        )}
      </View>

      {dmThreads.length > 0 ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Fan chats</Text>
          {dmThreads.slice(0, 20).map((t) => {
            const photo =
              t.userAvatar ||
              `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(t.userId)}&size=128`;
            return (
              <Pressable
                key={t.id}
                onPress={() =>
                  navigation.navigate('DirectChat', {
                    peerId: t.userId,
                    peerName: t.userName,
                    peerAvatar: t.userAvatar || photo,
                  })
                }
                style={[styles.row, { borderBottomColor: 'rgba(255,255,255,0.06)' }]}
              >
                <Image source={{ uri: photo }} style={styles.threadAvatar} />
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
            );
          })}
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

      <Pressable
        style={[styles.fabWrap, { bottom: insets.bottom + 88 }]}
        onPress={() => setMassOpen(true)}
      >
        <LinearGradient
          colors={['#3B82F6', '#6366F1', '#0EA5E9']}
          style={styles.fab}
        >
          <Megaphone size={28} color="#fff" />
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{massBadge > 99 ? '99+' : massBadge}</Text>
          </View>
        </LinearGradient>
        <Text style={styles.fabLabel}>Set message</Text>
      </Pressable>

      {/* Mass / set message composer */}
      <Modal visible={massOpen} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Set message</Text>
              <Pressable onPress={() => setMassOpen(false)} hitSlop={10}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>
              Broadcast to users online only
              {activeCount ? ` · ${activeCount} online now` : ' · none online'}
            </Text>
            <TextInput
              style={styles.massInput}
              value={massText}
              onChangeText={setMassText}
              placeholder="Write your message to online fans…"
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
                {sending ? 'Sending…' : 'Send to online users'}
              </Text>
            </Pressable>
            {lastSent != null ? (
              <Text style={styles.sentHint}>Last send reached {lastSent} users ✓</Text>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Help Center */}
      <Modal visible={helpOpen} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '88%' }]}>
            <View style={styles.sheetHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <BookOpen size={20} color="#60A5FA" />
                <Text style={styles.sheetTitle}>Help Center</Text>
              </View>
              <Pressable onPress={() => setHelpOpen(false)} hitSlop={10}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>
              Android host guides · open a ticket with admin
            </Text>

            <View style={styles.helpTabs}>
              {(
                [
                  ['articles', 'Guides'],
                  ['ticket', 'Ask admin'],
                  ['mine', 'My tickets'],
                ] as const
              ).map(([id, label]) => (
                <Pressable
                  key={id}
                  style={[styles.helpTab, helpTab === id && styles.helpTabOn]}
                  onPress={() => setHelpTab(id)}
                >
                  <Text style={[styles.helpTabText, helpTab === id && styles.helpTabTextOn]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {helpTab === 'articles' ? (
              <ScrollView style={{ maxHeight: 420 }}>
                {articles.length === 0 ? (
                  <Text style={styles.sheetSub}>Loading guides…</Text>
                ) : (
                  articles.map((a) => (
                    <Pressable
                      key={a.id}
                      style={styles.articleRow}
                      onPress={() =>
                        setExpandedArticle((id) => (id === a.id ? null : a.id))
                      }
                    >
                      <Text style={styles.articleCat}>{a.category}</Text>
                      <Text style={styles.articleTitle}>{a.title}</Text>
                      {expandedArticle === a.id ? (
                        <Text style={styles.articleBody}>{a.body}</Text>
                      ) : null}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            ) : null}

            {helpTab === 'ticket' ? (
              <ScrollView>
                <Text style={styles.sheetSub}>Category</Text>
                <View style={styles.catRow}>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.catChip,
                        supportCategory === c.id && styles.catChipOn,
                      ]}
                      onPress={() => setSupportCategory(c.id)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          supportCategory === c.id && styles.catChipTextOn,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.massInput}
                  value={supportText}
                  onChangeText={setSupportText}
                  placeholder="Describe your issue for admin…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  maxLength={800}
                />
                <Pressable
                  style={[styles.sendMass, supportBusy && { opacity: 0.6 }]}
                  disabled={supportBusy}
                  onPress={() => void submitSupport()}
                >
                  <Headphones size={18} color="#1a1200" />
                  <Text style={styles.sendMassText}>
                    {supportBusy ? 'Sending…' : 'Send to admin'}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {helpTab === 'mine' ? (
              <FlatList
                data={tickets}
                keyExtractor={(t) => t.id}
                style={{ maxHeight: 420 }}
                ListEmptyComponent={
                  <Text style={styles.sheetSub}>No tickets yet</Text>
                }
                renderItem={({ item }) => (
                  <View style={styles.ticketRow}>
                    <View style={styles.rowTop}>
                      <Text style={styles.ticketId}>{item.id}</Text>
                      <Text
                        style={[
                          styles.ticketStatus,
                          item.status === 'answered' && { color: '#34D399' },
                          item.status === 'closed' && { color: 'rgba(255,255,255,0.4)' },
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                    <Text style={styles.ticketText}>{item.text}</Text>
                    {item.adminReply ? (
                      <Text style={styles.ticketReply}>Admin: {item.adminReply}</Text>
                    ) : null}
                    <Text style={styles.rowTime}>{formatTime(item.updatedAt)}</Text>
                  </View>
                )}
              />
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
            <Text style={styles.sheetSub}>User ID + recharge coins · live updates</Text>
            <FlatList
              data={rechargeEvents}
              keyExtractor={(e) => e.id}
              ListEmptyComponent={
                <Text style={styles.sheetSub}>No recharges yet</Text>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pageTitle: { fontSize: 28, fontWeight: '900' },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52,211,153,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  onlinePillText: { color: '#34D399', fontWeight: '800', fontSize: 12 },
  onlineCard: {
    backgroundColor: 'rgba(20,28,46,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,255,0.16)',
    borderRadius: radii.xl,
    padding: 12,
    marginBottom: 14,
  },
  onlineHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setMsgLink: { color: '#60A5FA', fontWeight: '800', fontSize: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 4,
  },
  emptyFans: { fontSize: 12, marginTop: 10, marginBottom: 4, opacity: 0.8 },
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
  threadAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  fanChip: {
    width: 78,
    alignItems: 'center',
  },
  fanChipAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'rgba(52,211,153,0.55)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34D399',
    borderWidth: 2,
    borderColor: '#0E1424',
  },
  fanChipName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    width: 76,
  },
  dmMini: {
    marginTop: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F5C14C',
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
    borderColor: 'rgba(147,197,253,0.8)',
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
    color: '#93C5FD',
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
    borderColor: 'rgba(96,165,250,0.35)',
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
  helpTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  helpTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  helpTabOn: { backgroundColor: 'rgba(59,130,246,0.45)' },
  helpTabText: { color: 'rgba(255,255,255,0.65)', fontWeight: '800', fontSize: 12 },
  helpTabTextOn: { color: '#fff' },
  articleRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  articleCat: { color: '#60A5FA', fontSize: 11, fontWeight: '800', marginBottom: 2 },
  articleTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  articleBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 19,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  catChipOn: {
    backgroundColor: 'rgba(59,130,246,0.4)',
    borderColor: '#60A5FA',
  },
  catChipText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12 },
  catChipTextOn: { color: '#fff' },
  ticketRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  ticketId: { color: '#F5C14C', fontWeight: '800', fontSize: 12 },
  ticketStatus: { color: '#60A5FA', fontWeight: '800', fontSize: 12, textTransform: 'capitalize' },
  ticketText: { color: '#fff', marginTop: 6, fontSize: 13 },
  ticketReply: {
    color: '#34D399',
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
  },
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
