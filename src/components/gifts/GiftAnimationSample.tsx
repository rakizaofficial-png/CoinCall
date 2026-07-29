import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGiftAnimationQueue } from '../../context/GiftAnimationQueueContext';

const SAMPLE_COIN_LOTTIE =
  'https://assets10.lottiefiles.com/packages/lf20_q5pk6p1k.json';

export function GiftAnimationSample() {
  const { enqueueGiftAnimation, queueLength } = useGiftAnimationQueue();

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.button}
        onPress={() =>
          enqueueGiftAnimation({
            source: SAMPLE_COIN_LOTTIE,
            title: 'Coin Gift',
            senderName: 'Demo User',
            giftName: 'Gold Coin',
            coins: 99,
            durationMs: 4200,
          })
        }
      >
        <Text style={styles.buttonText}>Send Coin</Text>
      </Pressable>
      <Text style={styles.queueText}>Queued: {queueLength}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
    alignItems: 'center',
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: '#F5C14C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#160F04',
    fontSize: 14,
    fontWeight: '900',
  },
  queueText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
  },
});

