import { Video } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Waiting1v1Panel } from '../../components/Waiting1v1Panel';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function CallingScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { callsToday, myTodayMinutes, hostEarnings, incomingBridgeCall } = useApp();

  return (
    <Screen scroll contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>1V1</Text>
      <Text style={[styles.title, { color: colors.text }]}>Calling</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Go online · wait for private video calls
      </Text>

      <Waiting1v1Panel navigation={navigation} />

      <View style={styles.stats}>
        <GlassCard style={styles.stat}>
          <Video size={18} color={colors.primarySoft} />
          <Text style={[styles.statValue, { color: colors.text }]}>{callsToday}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Calls today</Text>
        </GlassCard>
        <GlassCard style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{myTodayMinutes}m</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Minutes</Text>
        </GlassCard>
        <GlassCard style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{hostEarnings.call}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Call coins</Text>
        </GlassCard>
      </View>

      {incomingBridgeCall ? (
        <PrimaryButton
          label={`Answer ${incomingBridgeCall.userName}`}
          onPress={() =>
            navigation.navigate('Call', {
              hostId: incomingBridgeCall.hostId,
              bridgeCallId: incomingBridgeCall.id,
              channel: incomingBridgeCall.channel,
              peerName: incomingBridgeCall.userName,
              peerAvatar: incomingBridgeCall.userAvatar,
              ratePerMinute: incomingBridgeCall.ratePerMinute,
              role: 'host',
            })
          }
          style={{ marginTop: 8 }}
        />
      ) : null}

      <PrimaryButton
        label="Wallet & withdraw"
        variant="ghost"
        onPress={() => navigation.navigate('Withdraw')}
        style={{ marginTop: 12 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontWeight: '800', letterSpacing: 1.2, fontSize: 11 },
  title: { fontSize: 30, fontWeight: '900', marginTop: 4 },
  sub: { marginTop: 6, marginBottom: 16, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 8 },
  stat: { flex: 1, alignItems: 'flex-start', gap: 4, padding: 12, borderRadius: radii.lg },
  statValue: { fontWeight: '900', fontSize: 20 },
  statLabel: { fontSize: 11 },
});
