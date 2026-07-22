import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Headphones,
  Image as ImageIcon,
  MessageSquarePlus,
  Plus,
  Send,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  createAdminSupportTicket,
  fetchHelpCenterArticles,
  fetchSupportTicket,
  fetchSupportTickets,
  replySupportTicket,
  type HelpArticle,
  type SupportTicketRow,
} from '../../services/hostOutreachService';
import { ADMIN_SUPPORT_ID } from '../../services/chatService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = { navigation: any };

function formatTime(ts: number) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

export function HelpCenterScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const { user: authUser } = useAuth();
  const hostId = authUser?.id || user.id;

  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [active, setActive] = useState<SupportTicketRow | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!hostId) return;
    const [t, a] = await Promise.all([
      fetchSupportTickets(hostId).catch(() => [] as SupportTicketRow[]),
      fetchHelpCenterArticles().catch(() => [] as HelpArticle[]),
    ]);
    setTickets(t);
    setArticles(a);
  }, [hostId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../../services/realtimeWs').then(({ subscribeRealtime }) => {
      unsub = subscribeRealtime((event) => {
        if (event.type !== 'support:ticket') return;
        const ticket = event.payload as SupportTicketRow;
        if (ticket?.hostId && ticket.hostId !== hostId) return;
        void load();
        if (active?.id && ticket?.id === active.id) {
          setActive(ticket);
        }
      });
    });
    return () => unsub?.();
  }, [active?.id, hostId, load]);

  const pickShot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Allow photos to upload screenshots');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    setShot(res.assets[0].uri);
  };

  const createTicket = async () => {
    const text = draft.trim();
    if (!text) {
      notify('Help Center', 'Write a message for admin');
      return;
    }
    setBusy(true);
    try {
      await createAdminSupportTicket({
        hostId,
        hostName: user.name,
        text,
        imageUrl: shot || undefined,
      });
      setDraft('');
      setShot(null);
      setComposeOpen(false);
      await load();
      notify('Ticket created', 'Admin will reply here');
    } catch (e) {
      notify('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const openTicket = async (id: string) => {
    const row = await fetchSupportTicket(id, hostId);
    setActive(row || tickets.find((t) => t.id === id) || null);
  };

  const sendReply = async () => {
    if (!active) return;
    const text = reply.trim();
    if (!text && !shot) return;
    setBusy(true);
    try {
      const updated = await replySupportTicket({
        ticketId: active.id,
        hostId,
        text: text || '📷 Screenshot',
        imageUrl: shot || undefined,
      });
      setActive(updated);
      setReply('');
      setShot(null);
      await load();
    } catch (e) {
      notify('Reply failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    const messages = active.messages?.length
      ? active.messages
      : [
          {
            id: 'seed',
            from: 'host' as const,
            text: active.text,
            imageUrl: active.imageUrl,
            createdAt: active.createdAt,
          },
        ];
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setActive(null)} style={styles.back} hitSlop={12}>
            <ChevronLeft size={28} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              Ticket {active.id}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {active.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const mine = item.from === 'host';
            return (
              <View
                style={[
                  styles.bubble,
                  mine ? styles.mine : styles.theirs,
                  {
                    backgroundColor: mine ? colors.primary : colors.bgCard,
                  },
                ]}
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.shot} />
                ) : null}
                <Text style={{ color: mine ? '#fff' : colors.text }}>{item.text}</Text>
                <Text
                  style={{
                    color: mine ? 'rgba(255,255,255,0.65)' : colors.textMuted,
                    fontSize: 10,
                    marginTop: 4,
                  }}
                >
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            );
          }}
        />
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable onPress={() => void pickShot()} style={styles.iconBtn}>
            <ImageIcon size={20} color={colors.textMuted} />
          </Pressable>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder="Reply to admin…"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.bgSoft, borderColor: colors.border },
            ]}
          />
          <Pressable
            onPress={() => void sendReply()}
            disabled={busy}
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          >
            <Send size={18} color="#fff" />
          </Pressable>
        </View>
        {shot ? (
          <Text style={{ color: colors.textMuted, fontSize: 11, paddingHorizontal: 16 }}>
            Screenshot attached
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={12}>
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Help Center</Text>
        <View style={{ width: 44 }} />
      </View>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        style={styles.hero}
      >
        <Headphones size={28} color="#fff" />
        <Text style={styles.heroTitle}>Administrator support</Text>
        <Text style={styles.heroSub}>
          Create tickets, upload screenshots, and chat with admin replies.
        </Text>
        <PrimaryButton
          label="Message admin"
          onPress={() =>
            navigation.navigate('DirectChat', {
              peerId: ADMIN_SUPPORT_ID,
              peerName: 'Administrator',
              peerAvatar: '',
            })
          }
          style={{ marginTop: 12 }}
        />
      </LinearGradient>

      <View style={styles.sectionHead}>
        <Text style={[styles.section, { color: colors.text }]}>Your tickets</Text>
        <Pressable onPress={() => setComposeOpen(true)} style={styles.newBtn}>
          <Plus size={16} color={colors.primarySoft} />
          <Text style={{ color: colors.primarySoft, fontWeight: '800' }}>New</Text>
        </Pressable>
      </View>

      {tickets.length === 0 ? (
        <Pressable
          onPress={() => setComposeOpen(true)}
          style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
        >
          <MessageSquarePlus size={28} color={colors.primarySoft} />
          <Text style={{ color: colors.text, fontWeight: '800', marginTop: 8 }}>
            Create your first ticket
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>
            Describe the issue and attach a screenshot if needed.
          </Text>
        </Pressable>
      ) : (
        tickets.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => void openTicket(t.id)}
            style={[styles.ticket, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.ticketId, { color: colors.text }]}>{t.id}</Text>
              <Text style={{ color: colors.textSecondary }} numberOfLines={2}>
                {t.text}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                {formatTime(t.updatedAt)} · {t.status}
              </Text>
            </View>
          </Pressable>
        ))
      )}

      <Text style={[styles.section, { color: colors.text, marginTop: 20 }]}>FAQ</Text>
      {articles.map((a) => (
        <View
          key={a.id}
          style={[styles.faq, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        >
          <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>
            {a.category}
          </Text>
          <Text style={{ color: colors.text, fontWeight: '800', marginTop: 4 }}>{a.title}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: 6, lineHeight: 20 }}>
            {a.body}
          </Text>
        </View>
      ))}

      <Modal visible={composeOpen} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>New support ticket</Text>
              <Pressable onPress={() => setComposeOpen(false)} hitSlop={10}>
                <X size={22} color="#fff" />
              </Pressable>
            </View>
            <TextInput
              style={styles.massInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Describe your issue for admin…"
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline
              maxLength={1000}
            />
            {shot ? (
              <Image source={{ uri: shot }} style={styles.preview} />
            ) : (
              <Pressable onPress={() => void pickShot()} style={styles.attach}>
                <ImageIcon size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Upload screenshot</Text>
              </Pressable>
            )}
            <PrimaryButton
              label={busy ? 'Sending…' : 'Create ticket'}
              onPress={() => void createTicket()}
              disabled={busy}
              style={{ marginTop: 12 }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  hero: { borderRadius: radii.lg, padding: 18, marginBottom: 16 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 10 },
  heroSub: { color: 'rgba(255,255,255,0.75)', marginTop: 6, lineHeight: 20 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  section: { fontWeight: '800', fontSize: 16, marginBottom: 8 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  ticket: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  ticketId: { fontWeight: '800', marginBottom: 4 },
  faq: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  shot: { width: 160, height: 160, borderRadius: 12, marginBottom: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  iconBtn: { padding: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#12101a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  massInput: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    padding: 12,
    textAlignVertical: 'top',
  },
  attach: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  preview: {
    marginTop: 12,
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
});
