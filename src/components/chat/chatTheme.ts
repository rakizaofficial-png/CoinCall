/** Shared chat visual tokens — modern messaging look */
export const CHAT_THEME = {
  bg: '#070A14',
  headerBg: 'rgba(7, 10, 20, 0.96)',
  composerBg: 'rgba(14, 20, 36, 0.98)',
  border: 'rgba(148, 163, 255, 0.14)',
  mineBubble: '#6C7CFF',
  theirsBubble: '#141C2E',
  mineText: '#FFFFFF',
  theirsText: '#F4F7FF',
  muted: '#7E89B0',
  accent: '#5CE1E6',
  coral: '#FF2A7A',
  bubbleRadius: 20,
  bubbleRadiusTail: 6,
  maxBubbleWidth: '78%',
  inputBg: '#0E1424',
  inputBorder: 'rgba(148, 163, 255, 0.2)',
} as const;

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
