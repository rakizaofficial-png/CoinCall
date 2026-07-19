import { ChevronLeft, Image as ImageIcon, Video } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { Avatar } from '../../components/ui/Avatar';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { listenChatMessages, sendChatMessage, fetchDmMessages, type ChatMessage } from '../../services/chatService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'DirectChat'>;

export function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user: authUser } = useAuth();
  const { getHost, startCall, user } = useApp();
  const peerId = route.params.peerId;
  const peerName = route.params.peerName || getHost(peerId)?.name || 'Fan';
  const peerAvatar =
    route.params.peerAvatar || getHost(peerId)?.avatarUrl || '';
  const meId = authUser?.id || user.id;
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!peerId || !meId) return;
    return listenChatMessages(meId, peerId, setMessages);
  }, [peerId, meId]);

  const send = async (imageUrl?: string) => {
    if ((!text.trim() && !imageUrl) || sending) return;
    setSending(true);
    try {
      await sendChatMessage({
        fromId: meId,
        toId: peerId,
        text: text.trim() || (imageUrl ? '📷 Photo' : ''),
        fromName: user.name,
        fromAvatar: user.avatarUrl,
        peerName,
        peerAvatar,
        fromRole: 'host',
        imageUrl,
      });
      setText('');
      setPreview(null);
      const rows = await fetchDmMessages(meId, peerId);
      if (rows.length) setMessages(rows);
    } catch (e) {
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
    setPreview(res.assets[0].uri);
    await send(res.assets[0].uri);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Avatar uri={peerAvatar} size={36} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {peerName}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Direct message</Text>
        </View>
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
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const mine = item.fromId === meId;
          return (
            <View
              style={[
                styles.bubble,
                mine ? styles.mine : styles.theirs,
                mine
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.bgCard },
              ]}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.img} />
              ) : null}
              <Text style={{ color: mine ? '#fff' : colors.text }}>{item.text}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text
            style={{
              color: colors.textSecondary,
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            No messages yet — fans who message you appear here.
          </Text>
        }
      />

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={() => void sendImage()} style={styles.iconBtn}>
          <ImageIcon size={20} color={colors.textMuted} />
        </Pressable>
        <AppTextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          style={{ flex: 1 }}
        />
        <PrimaryButton
          label={sending ? '…' : 'Send'}
          onPress={() => void send()}
          disabled={sending || !text.trim()}
          style={{ paddingHorizontal: 16, minWidth: 72 }}
        />
      </View>
      {preview ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            paddingHorizontal: 16,
          }}
        >
          Sending image…
        </Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 4,
  },
  back: { padding: 6 },
  name: { fontWeight: '800', fontSize: 16 },
  sub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  img: { width: 160, height: 160, borderRadius: 12, marginBottom: 6 },
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
});
