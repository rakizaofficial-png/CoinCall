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
import { listenChatMessages, sendChatMessage, type ChatMessage } from '../../services/chatService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user: authUser } = useAuth();
  const { getHost, startCall, user } = useApp();
  const host = getHost(route.params.hostId);
  const meId = authUser?.id || user.id;
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!host) return;
    return listenChatMessages(meId, host.id, setMessages);
  }, [host, meId]);

  if (!host) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Host not found</Text>
      </View>
    );
  }

  const send = async (imageUrl?: string) => {
    if ((!text.trim() && !imageUrl) || sending) return;
    setSending(true);
    try {
      await sendChatMessage({
        fromId: meId,
        toId: host.id,
        text: text.trim() || (imageUrl ? '📷 Photo' : ''),
        fromName: user.name,
        imageUrl,
      });
      setText('');
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
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    await send(res.assets[0].uri);
  };

  const onCall = () => {
    const result = startCall(host.id);
    if (!result.ok) {
      notify('Cannot start call', result.message);
      return;
    }
    navigation.navigate('Call', { hostId: host.id });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>
        <Avatar uri={host.avatarUrl} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]}>{host.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {host.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
        <Pressable
          onPress={onCall}
          style={[styles.callBtn, { backgroundColor: colors.primary }]}
          accessibilityLabel="Start video call"
        >
          <Video size={18} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
            Say hi — text & photos sync in realtime.
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.fromId === meId;
          return (
            <View
              style={[
                styles.bubble,
                {
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? colors.primary : colors.bgCard,
                  borderColor: colors.border,
                },
              ]}
            >
              {item.imageUrl ? (
                <Pressable onPress={() => setPreview(item.imageUrl!)}>
                  <Image source={{ uri: item.imageUrl }} style={styles.msgImage} />
                </Pressable>
              ) : null}
              {item.text && item.text !== '📷 Photo' ? (
                <Text style={{ color: mine ? '#fff' : colors.text }}>{item.text}</Text>
              ) : null}
            </View>
          );
        }}
      />

      <View
        style={[
          styles.composer,
          {
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 8,
            backgroundColor: colors.bgElevated,
          },
        ]}
      >
        <Pressable
          onPress={() => void sendImage()}
          style={[styles.imgBtn, { borderColor: colors.border }]}
        >
          <ImageIcon size={20} color={colors.primarySoft} />
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
          style={{ minWidth: 88 }}
        />
      </View>

      {preview ? (
        <Pressable style={styles.preview} onPress={() => setPreview(null)}>
          <Image source={{ uri: preview }} style={styles.previewImg} />
        </Pressable>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 40, height: 40, justifyContent: 'center' },
  name: { fontWeight: '800', fontSize: 16 },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  msgImage: { width: 180, height: 140, borderRadius: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  imgBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  previewImg: { width: '90%', height: '70%', resizeMode: 'contain', borderRadius: 12 },
});
