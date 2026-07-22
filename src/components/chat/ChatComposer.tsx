import { Image as ImageIcon, Send } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { font } from '../../theme/fonts';
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
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {onPickImage ? (
        <Pressable onPress={onPickImage} style={styles.iconBtn} hitSlop={8}>
          <ImageIcon size={22} color={CHAT_THEME.muted} />
        </Pressable>
      ) : null}
      <View style={styles.inputShell}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={CHAT_THEME.muted}
          style={styles.input}
          multiline
          maxLength={500}
          textAlignVertical="center"
        />
      </View>
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
    paddingTop: 10,
    backgroundColor: CHAT_THEME.composerBg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  inputShell: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: CHAT_THEME.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_THEME.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  input: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 20,
    color: CHAT_THEME.mineText,
    padding: 0,
    margin: 0,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHAT_THEME.mineBubble,
    marginBottom: 2,
  },
  sendDisabled: { opacity: 0.4 },
});
