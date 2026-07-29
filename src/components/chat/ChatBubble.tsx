import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { font } from '../../theme/fonts';
import { CHAT_THEME, type ChatMessageStatus } from './chatTheme';
import { formatChatTime } from './formatChatTime';

export type ChatBubbleMessage = {
  id: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
  kind?: 'text' | 'image' | 'support' | 'gift';
  giftName?: string;
  giftEmoji?: string;
  giftCoins?: number;
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
        {message.kind === 'gift' ? (
          <View style={styles.giftCard}>
            <Text style={styles.giftEmoji}>{message.giftEmoji || '🎁'}</Text>
            <View style={styles.giftCopy}>
              <Text style={styles.giftLabel}>
                {mine ? 'You sent a gift' : 'Gift received'}
              </Text>
              <Text style={styles.giftName}>{message.giftName || 'Gift'}</Text>
              <Text style={styles.giftCoins}>
                {(message.giftCoins || 0).toLocaleString()} coins
              </Text>
            </View>
          </View>
        ) : null}
        {message.imageUrl ? (
          <Pressable onPress={() => onImagePress?.(message.imageUrl!)}>
            <Image source={{ uri: message.imageUrl }} style={styles.image} />
          </Pressable>
        ) : null}
        {message.text && message.kind !== 'gift' ? (
          <Text
            style={[
              styles.body,
              { color: mine ? CHAT_THEME.mineText : CHAT_THEME.theirsText },
            ]}
          >
            {message.text}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Text style={[styles.time, !mine && styles.timeTheirs]}>
            {formatChatTime(message.createdAt)}
          </Text>
          {mine && message.status === 'sending' ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
          ) : receipt ? (
            <Text
              style={[
                styles.receipt,
                message.status === 'read' && { color: CHAT_THEME.accent },
                message.status === 'failed' && { color: '#FF8FA3' },
              ]}
            >
              {receipt}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 10, maxWidth: '100%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: CHAT_THEME.bubbleRadius,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  mine: {
    borderBottomRightRadius: CHAT_THEME.bubbleRadiusTail,
  },
  theirs: {
    borderBottomLeftRadius: CHAT_THEME.bubbleRadiusTail,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHAT_THEME.border,
  },
  body: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 14,
    marginBottom: 6,
  },
  giftCard: {
    minWidth: 210,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 10,
    backgroundColor: 'rgba(255,184,0,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,210,92,0.45)',
  },
  giftEmoji: { fontSize: 38 },
  giftCopy: { flex: 1 },
  giftLabel: {
    fontFamily: font.medium,
    fontSize: 11,
    color: '#FFD977',
    fontWeight: '600',
  },
  giftName: {
    fontFamily: font.bold,
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '800',
    marginTop: 1,
  },
  giftCoins: {
    fontFamily: font.medium,
    fontSize: 12,
    color: '#FFD977',
    fontWeight: '700',
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 5,
  },
  time: {
    fontFamily: font.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  timeTheirs: { color: 'rgba(244,247,255,0.45)' },
  receipt: {
    fontFamily: font.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
  },
});
