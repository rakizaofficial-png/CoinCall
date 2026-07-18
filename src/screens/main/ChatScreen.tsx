import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

type Message = { id: string; fromMe: boolean; text: string };

export function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { getHost, startCall } = useApp();
  const host = getHost(route.params.hostId);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      fromMe: false,
      text: `Hi! I'm ${host?.name ?? 'here'}. Want to start a video call?`,
    },
  ]);

  if (!host) {
    return (
      <View style={styles.container}>
        <Text style={{ color: colors.text }}>Host not found</Text>
      </View>
    );
  }

  const send = () => {
    if (!text.trim()) return;
    const mine: Message = { id: `${Date.now()}`, fromMe: true, text: text.trim() };
    setMessages((m) => [...m, mine]);
    setText('');
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: `${Date.now()}_r`,
          fromMe: false,
          text: 'Nice! Tap Call when you are ready 💜',
        },
      ]);
    }, 600);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Image source={{ uri: host.avatarUrl }} style={styles.avatar} />
        <Text style={styles.name}>{host.name}</Text>
        <Pressable
          style={styles.callChip}
          onPress={() => {
            const result = startCall(host.id);
            if (!result.ok) {
              notify('Cannot start call', result.message ?? 'Try again');
              return;
            }
            navigation.navigate('Call', { hostId: host.id });
          }}
        >
          <Text style={styles.callChipText}>Call</Text>
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.fromMe ? styles.mine : styles.theirs,
            ]}
          >
            <Text style={styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
        />
        <Pressable style={styles.send} onPress={send}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.textSecondary, fontSize: 16, width: 56 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  name: { color: colors.text, fontWeight: '800', flex: 1 },
  callChip: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  callChipText: { color: colors.text, fontWeight: '800' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.bgCard },
  bubbleText: { color: colors.text },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
  },
  send: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendText: { color: colors.text, fontWeight: '800' },
});
