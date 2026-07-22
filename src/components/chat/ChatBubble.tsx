import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CHAT_THEME, type ChatMessageStatus } from './chatTheme';
import { formatChatTime } from './formatChatTime';

export type ChatBubbleMessage = {
  id: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
  fromMe: boolean;
  status?: ChatMessageStatus;
};

function receiptLabel(status?: ChatMessageStatus) {
  if (status === 'sending') return '…';
  if (status === 'failed') return '!';
  if (status === 'read') return '✓✓';
  if (status === 'delivered' || status === 'sent') return '✓';
  return '';
}

export function ChatBubble({
  message,
  onImagePress,
}: {
  message: ChatBubbleMessage;
  onImagePress?: (uri: string) => void;
}) {
  const mine = message.fromMe;
  const receipt = mine ? receiptLabel(message.status) : '';
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          mine ? styles.mine : styles.theirs,
          { backgroundColor: mine ? CHAT_THEME.mineBubble : CHAT_THEME.theirsBubble },
        ]}
      >
        {message.imageUrl ? (
          <Pressable onPress={() => onImagePress?.(message.imageUrl!)}>
            <Image source={{ uri: message.imageUrl }} style={styles.image} />
          </Pressable>
        ) : null}
        {message.text ? (
          <Text style={{ color: mine ? CHAT_THEME.mineText : CHAT_THEME.theirsText }}>
            {message.text}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Text style={styles.time}>{formatChatTime(message.createdAt)}</Text>
          {mine && message.status === 'sending' ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
          ) : receipt ? (
            <Text style={styles.receipt}>{receipt}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 8, maxWidth: '100%' },
  rowMine: { alignSelf: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: CHAT_THEME.bubbleRadius,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: {
    borderBottomRightRadius: CHAT_THEME.bubbleRadiusTail,
  },
  theirs: {
    borderBottomLeftRadius: CHAT_THEME.bubbleRadiusTail,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_THEME.border,
  },
  image: {
    width: 180,
    height: 180,
    borderRadius: 12,
    marginBottom: 6,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  time: { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  receipt: { fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: '800' },
});
