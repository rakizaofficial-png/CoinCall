import { ChevronLeft, Video } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatBubble, type ChatBubbleMessage } from '../../components/chat/ChatBubble';
import { ChatSystemProfileHeader } from '../../components/chat/ChatSystemProfileHeader';
import { ChatComposer } from '../../components/chat/ChatComposer';
import { ChatThreadLayout } from '../../components/chat/ChatThreadLayout';
import { ImageViewerModal } from '../../components/chat/ImageViewerModal';
import { TypingIndicator } from '../../components/chat/TypingIndicator';
import { CHAT_THEME } from '../../components/chat/chatTheme';
import { Avatar } from '../../components/ui/Avatar';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  listenChatMessages,
  sendChatMessage,
  fetchDmMessages,
  type ChatMessage,
} from '../../services/chatService';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'DirectChat'>;

export function ChatScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { user: authUser } = useAuth();
  const { getHost, startCall, user } = useApp();
  const listRef = useRef<FlatList<ChatBubbleMessage>>(null);
  const peerId = route.params.peerId;
  const peerName = route.params.peerName || getHost(peerId)?.name || 'Fan';
  const peerAvatar =
    route.params.peerAvatar || getHost(peerId)?.avatarUrl || '';
  const meId = authUser?.id || user.id;
  const isSystemChat =
    peerId === 'admin_support' ||
    peerId.startsWith('admin') ||
    peerId === 'system' ||
    peerName.toLowerCase().includes('administrator') ||
    peerName.toLowerCase().includes('system');
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ChatBubbleMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);

  useEffect(() => {
    if (!peerId || !meId) return;
    return listenChatMessages(meId, peerId, (rows) => {
      setMessages(rows);
      setPeerTyping(false);
    });
  }, [peerId, meId]);

  const bubbles = useMemo<ChatBubbleMessage[]>(() => {
    const server: ChatBubbleMessage[] = messages.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      imageUrl: m.imageUrl,
      fromMe: m.fromId === meId,
      status: (m.fromId === meId
        ? m.readAt
          ? 'read'
          : m.deliveredAt
            ? 'delivered'
            : 'sent'
        : undefined) as ChatBubbleMessage['status'],
    }));
    const merged = [...server];
    for (const p of pending) {
      if (!merged.some((m) => m.id === p.id)) merged.push(p);
    }
    return merged.sort((a, b) => a.createdAt - b.createdAt);
  }, [meId, messages, pending]);

  useEffect(() => {
    if (!bubbles.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [bubbles.length]);

  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [text]);

  const send = async (imageUrl?: string) => {
    if ((!text.trim() && !imageUrl) || sending) return;
    const body = text.trim() || (imageUrl ? '📷 Photo' : '');
    const tempId = `pending_${Date.now()}`;
    const optimistic: ChatBubbleMessage = {
      id: tempId,
      text: body,
      createdAt: Date.now(),
      imageUrl,
      fromMe: true,
      status: 'sending',
    };
    setPending((p) => [...p, optimistic]);
    setText('');
    setSending(true);
    try {
      await sendChatMessage({
        fromId: meId,
        toId: peerId,
        text: body,
        fromName: user.name,
        fromAvatar: user.avatarUrl,
        peerName,
        peerAvatar,
        fromRole: 'host',
        imageUrl,
      });
      setPending((p) => p.filter((m) => m.id !== tempId));
      const rows = await fetchDmMessages(meId, peerId, meId);
      if (rows.length) setMessages(rows);
    } catch (e) {
      setPending((p) =>
        p.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
      );
      notify('Chat', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  };

  const sendImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission', 'Allow photos to send images');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: false,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    await send(res.assets[0].uri);
  };

  const header = (
    <View style={styles.headerInner}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back}>
        <ChevronLeft size={22} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={() => {
          if (peerId.startsWith('admin') || peerId === 'admin_support') return;
          navigation.navigate('FanProfile', {
            userId: peerId,
            userName: peerName,
            avatarUrl: peerAvatar,
          });
        }}
        style={styles.headerCenter}
      >
        <Avatar uri={peerAvatar} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {peerName}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {peerTyping ? 'typing…' : 'Direct message'}
          </Text>
        </View>
      </Pressable>
      {peerId.startsWith('admin') || peerId === 'admin_support' ? null : (
        <Pressable
          onPress={() => {
            const r = startCall(peerId);
            if (r.ok) {
              navigation.navigate('Call', {
                hostId: peerId,
                peerName,
                peerAvatar,
                role: 'host',
              });
            } else {
              notify('Call', r.message || 'Unavailable');
            }
          }}
          style={styles.callBtn}
        >
          <Video size={18} color="#fff" />
        </Pressable>
      )}
    </View>
  );

  return (
    <>
      <ChatThreadLayout
        header={header}
        listHeader={
          isSystemChat ? (
            <ChatSystemProfileHeader
              onNavigate={(screen) => navigation.navigate(screen)}
            />
          ) : undefined
        }
        composer={
          <ChatComposer
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (v.trim()) setPeerTyping(false);
            }}
            onSend={() => void send()}
            onPickImage={() => void sendImage()}
            sending={sending}
            bottomInset={0}
          />
        }
      >
        <FlatList
          ref={listRef}
          data={bubbles}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <ChatBubble message={item} onImagePress={setViewerUri} />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No messages yet — fans who message you appear here.
            </Text>
          }
          ListFooterComponent={peerTyping ? <TypingIndicator /> : null}
        />
      </ChatThreadLayout>
      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 6,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 0 },
  name: { fontWeight: '700', fontSize: 16, letterSpacing: -0.2 },
  sub: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CHAT_THEME.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  empty: {
    color: CHAT_THEME.muted,
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 24,
  },
});
