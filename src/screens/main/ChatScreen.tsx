import { ChevronLeft, Video } from 'lucide-react-native';
import { useState } from 'react';
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
import type { RootStackParamList } from '../../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
type Message = { id: string; fromMe: boolean; text: string };

export function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
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
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
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
          text: 'Nice! Tap Call when you are ready.',
        },
      ]);
    }, 600);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          style={styles.backBtn}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Avatar uri={host.avatarUrl} size={40} online={host.isOnline} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {host.name}
        </Text>
        <Pressable
          style={[styles.callChip, { backgroundColor: colors.primary }]}
          onPress={() => {
            const result = startCall(host.id);
            if (!result.ok) {
              notify('Cannot start call', result.message ?? 'Try again');
              return;
            }
            navigation.navigate('Call', { hostId: host.id });
          }}
          accessibilityRole="button"
        >
          <Video size={16} color="#fff" />
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
              item.fromMe
                ? { backgroundColor: colors.primary, alignSelf: 'flex-end' }
                : {
                    backgroundColor: colors.bgCard,
                    borderColor: colors.border,
                    borderWidth: 1,
                    alignSelf: 'flex-start',
                  },
            ]}
          >
            <Text style={{ color: item.fromMe ? '#fff' : colors.text, lineHeight: 20 }}>
              {item.text}
            </Text>
          </View>
        )}
      />

      <View
        style={[
          styles.composer,
          {
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 10,
            backgroundColor: colors.bgElevated,
          },
        ]}
      >
        <AppTextInput
          style={{ flex: 1 }}
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          onSubmitEditing={send}
        />
        <PrimaryButton label="Send" onPress={send} style={{ minWidth: 88 }} />
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
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontWeight: '800', fontSize: 16 },
  callChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.full,
    minHeight: 40,
  },
  callChipText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 10,
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
