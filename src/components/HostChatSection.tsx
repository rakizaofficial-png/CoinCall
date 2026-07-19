import { Megaphone, MessageSquare, Radio, Send, User } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useLiveStudio } from '../context/LiveStudioContext';
import {
  listenChatMessages,
  sendChatMessage,
  type ChatMessage,
} from '../services/chatService';
import {
  fetchActiveUsers,
  type ActiveUserRow,
} from '../services/hostOutreachService';
import type { LiveComment } from '../services/liveRoomService';
import { notify } from '../utils/notify';

type ChatTab = 'room' | 'user' | 'mass';

type Props = {
  /** Compact overlay for live stage */
  compact?: boolean;
  onOpenImage?: (url: string) => void;
};

export function HostChatSection({ compact, onOpenImage }: Props) {
  const { user } = useApp();
  const {
    comments,
    gifts,
    myLiveRoom,
    sendComment,
    massTextAllActive,
    openRoom,
  } = useLiveStudio();

  const [tab, setTab] = useState<ChatTab>('room');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUserRow[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peerName, setPeerName] = useState('');
  const [dmMessages, setDmMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (myLiveRoom?.id) openRoom(myLiveRoom.id);
  }, [myLiveRoom?.id, openRoom]);

  useEffect(() => {
    void fetchActiveUsers().then(setActiveUsers);
    const t = setInterval(() => {
      void fetchActiveUsers().then(setActiveUsers);
    }, 12_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!peerId) {
      setDmMessages([]);
      return;
    }
    return listenChatMessages(user.id, peerId, setDmMessages);
  }, [peerId, user.id]);

  const chatUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const u of activeUsers) {
      if (u.userId !== user.id) map.set(u.userId, { id: u.userId, name: u.userName });
    }
    for (const c of comments) {
      if (c.userId && c.userId !== user.id && c.userId !== 'system') {
        map.set(c.userId, { id: c.userId, name: c.userName });
      }
    }
    for (const g of gifts) {
      if (g.fromId && g.fromId !== user.id) {
        map.set(g.fromId, { id: g.fromId, name: g.fromName });
      }
    }
    return [...map.values()];
  }, [activeUsers, comments, gifts, user.id]);

  const sendRoom = async () => {
    if (!text.trim()) return;
    if (!myLiveRoom?.isLive) {
      notify('Start party / live first', 'Open stage to use room chat');
      return;
    }
    setBusy(true);
    try {
      await sendComment(text);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  const sendDm = async () => {
    if (!text.trim() || !peerId) {
      notify('Pick a user', 'Select someone to chat with');
      return;
    }
    setBusy(true);
    try {
      await sendChatMessage({
        fromId: user.id,
        toId: peerId,
        text: text.trim(),
        fromName: user.name,
        fromAvatar: user.avatarUrl,
        peerName,
        fromRole: 'host',
      });
      setText('');
    } catch (e) {
      notify('Chat failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const sendMass = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const n = await massTextAllActive(text);
      setText('');
      notify('Mass text sent', `${n} active users`);
    } catch (e) {
      notify('Mass text failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onSend = () => {
    if (tab === 'room') void sendRoom();
    else if (tab === 'user') void sendDm();
    else void sendMass();
  };

  const placeholder =
    tab === 'room'
      ? 'Message the room…'
      : tab === 'user'
        ? peerId
          ? `Message ${peerName || 'user'}…`
          : 'Select a user first…'
        : 'Mass text all active users…';

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.header}>
        <MessageSquare size={16} color="#9B8CFF" />
        <Text style={styles.title}>Chat section</Text>
      </View>

      <View style={styles.tabs}>
        {(
          [
            { id: 'room' as const, label: 'Room', Icon: Radio },
            { id: 'user' as const, label: 'User', Icon: User },
            { id: 'mass' as const, label: 'Mass', Icon: Megaphone },
          ] as const
        ).map(({ id, label, Icon }) => (
          <Pressable
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabOn]}
          >
            <Icon size={14} color={tab === id ? '#fff' : 'rgba(255,255,255,0.55)'} />
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'user' ? (
        <FlatList
          horizontal
          data={chatUsers}
          keyExtractor={(u) => u.id}
          style={styles.userStrip}
          contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No users yet — wait for viewers</Text>
          }
          renderItem={({ item }) => {
            const on = peerId === item.id;
            return (
              <Pressable
                onPress={() => {
                  setPeerId(item.id);
                  setPeerName(item.name);
                }}
                style={[styles.userChip, on && styles.userChipOn]}
              >
                <Text style={styles.userChipText} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.userChipId} numberOfLines={1}>
                  {item.id.slice(0, 10)}
                </Text>
              </Pressable>
            );
          }}
        />
      ) : null}

      {tab === 'mass' ? (
        <Text style={styles.hint}>
          Sends to every active user ({activeUsers.length} online)
        </Text>
      ) : null}

      <FlatList
        data={
          (tab === 'user'
            ? dmMessages.map((m) => ({
                id: m.id,
                userId: m.fromId,
                userName: m.fromId === user.id ? 'You' : peerName || 'User',
                text: m.text,
                createdAt: m.createdAt,
                kind: 'comment' as const,
                imageUrl: m.imageUrl,
              }))
            : tab === 'room'
              ? comments
              : []) as LiveComment[]
        }
        keyExtractor={(c) => c.id}
        style={[styles.list, compact && styles.listCompact]}
        contentContainerStyle={{ paddingBottom: 6 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === 'mass'
              ? 'Write a mass message below'
              : tab === 'user'
                ? peerId
                  ? 'Say hi to start the chat'
                  : 'Pick a user above'
                : myLiveRoom?.isLive
                  ? 'No room messages yet'
                  : 'Start party live to open room chat'}
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.kind === 'recharge' && styles.bubbleRecharge,
              item.userId === user.id && styles.bubbleMine,
            ]}
          >
            <Text style={styles.bubbleUser}>{item.userName}</Text>
            <Text style={styles.bubbleText}>{item.text}</Text>
            {item.imageUrl ? (
              <Pressable onPress={() => onOpenImage?.(item.imageUrl!)}>
                <Image source={{ uri: item.imageUrl }} style={styles.img} />
              </Pressable>
            ) : null}
          </View>
        )}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.4)"
          onSubmitEditing={onSend}
        />
        <Pressable
          style={[styles.sendBtn, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={onSend}
        >
          {tab === 'mass' ? (
            <Megaphone size={18} color="#1a1200" />
          ) : (
            <Send size={18} color="#1a1200" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(8,10,20,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(155,140,255,0.35)',
    padding: 12,
    gap: 8,
  },
  wrapCompact: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontWeight: '900', fontSize: 14 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabOn: { backgroundColor: 'rgba(108,124,255,0.75)' },
  tabText: { color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 11 },
  tabTextOn: { color: '#fff' },
  userStrip: { maxHeight: 56 },
  userChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 88,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  userChipOn: {
    borderColor: '#9B8CFF',
    backgroundColor: 'rgba(155,140,255,0.25)',
  },
  userChipText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  userChipId: { color: 'rgba(255,255,255,0.45)', fontSize: 9, marginTop: 2 },
  hint: { color: 'rgba(245,193,76,0.9)', fontSize: 11, fontWeight: '700' },
  list: { maxHeight: 220 },
  listCompact: { maxHeight: 140 },
  empty: { color: 'rgba(255,255,255,0.45)', fontSize: 12, paddingVertical: 10 },
  bubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    maxWidth: '92%',
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(108,124,255,0.45)',
  },
  bubbleRecharge: {
    backgroundColor: 'rgba(245,193,76,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245,193,76,0.4)',
  },
  bubbleUser: { color: '#9B8CFF', fontWeight: '800', fontSize: 10 },
  bubbleText: { color: '#fff', fontSize: 13 },
  img: { width: 110, height: 80, borderRadius: 8, marginTop: 6 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F5C14C',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
