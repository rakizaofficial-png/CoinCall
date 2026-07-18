import { ChevronLeft, Video } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  FlatList,
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

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendChatMessage({
        fromId: meId,
        toId: host.id,
        text: text.trim(),
        fromName: user.name,
      });
      setText('');
    } catch (e) {
      notify('Chat', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
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
            Say hi — messages sync in realtime.
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
              <Text style={{ color: mine ? '#fff' : colors.text }}>{item.text}</Text>
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
        <AppTextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          style={{ flex: 1 }}
        />
        <PrimaryButton
          label={sending ? '…' : 'Send'}
          onPress={send}
          disabled={sending || !text.trim()}
          style={{ minWidth: 88 }}
        />
      </View>
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
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
