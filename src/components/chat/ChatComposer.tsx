import { Image as ImageIcon, Send } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppTextInput } from '../ui/AppTextInput';
import { CHAT_THEME } from './chatTheme';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onPickImage?: () => void;
  sending?: boolean;
  placeholder?: string;
  bottomInset?: number;
};

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onPickImage,
  sending,
  placeholder = 'Message…',
  bottomInset = 0,
}: Props) {
  const canSend = Boolean(value.trim()) && !sending;
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {onPickImage ? (
        <Pressable onPress={onPickImage} style={styles.iconBtn} hitSlop={8}>
          <ImageIcon size={20} color={CHAT_THEME.muted} />
        </Pressable>
      ) : null}
      <AppTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        style={styles.input}
        multiline
        maxLength={500}
      />
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        style={[styles.sendBtn, !canSend && styles.sendDisabled]}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Send size={18} color="#fff" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_THEME.border,
    backgroundColor: CHAT_THEME.bg,
  },
  iconBtn: { padding: 8, marginBottom: 4 },
  input: { flex: 1, maxHeight: 120, marginBottom: 2 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT_THEME.mineBubble,
    marginBottom: 2,
  },
  sendDisabled: { opacity: 0.45 },
});
