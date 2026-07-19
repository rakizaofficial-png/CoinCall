import { LinearGradient } from 'expo-linear-gradient';
import {
  Clock,
  Gift,
  Heart,
  Radio,
  Users,
  Wallet,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

export function DashboardScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const {
    user,
    hostOnline,
    setHostOnline,
    callsToday,
    myTodayMinutes,
    hostEarnings,
  } = useApp();
  const { todayLiveGiftCoins, monthlyEarn, liveSeconds, myLiveRoom } = useLiveStudio();

  const todayEarn =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    todayLiveGiftCoins;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 16,
        paddingBottom: 120,
      }}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.hello, { color: colors.textSecondary }]}>
            Welcome back
          </Text>
          <Text style={[styles.name, { color: colors.text }]}>{user.name}</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Profile')}>
          <Avatar uri={user.avatarUrl} size={52} online={hostOnline} ring />
        </Pressable>
      </View>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>Today's earnings</Text>
        <Text style={styles.heroValue}>{todayEarn}</Text>
        <Text style={styles.heroSub}>coins · monthly {monthlyEarn}</Text>
        <View style={styles.heroActions}>
          <PrimaryButton
            label={myLiveRoom?.isLive ? 'Return Live' : 'Go Live'}
            onPress={() =>
              myLiveRoom?.isLive
                ? navigation.navigate('LiveRoom', {
                    roomId: myLiveRoom.id,
                    hostMode: true,
                  })
                : navigation.navigate('GoLive')
            }
            style={{ flex: 1 }}
          />
          <Pressable
            style={styles.secondary}
            onPress={() => navigation.navigate('Withdraw')}
          >
            <Wallet size={18} color="#fff" />
            <Text style={styles.secondaryText}>Withdraw</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.grid}>
        {[
          { icon: Radio, label: 'Calls today', value: callsToday },
          { icon: Clock, label: 'Minutes', value: myTodayMinutes },
          { icon: Gift, label: 'Live gifts', value: todayLiveGiftCoins },
          { icon: Heart, label: 'Live time', value: `${Math.floor(liveSeconds / 60)}m` },
        ].map((s) => (
          <GlassCard key={s.label} style={styles.stat}>
            <s.icon size={18} color={colors.primarySoft} />
            <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </GlassCard>
        ))}
      </View>

      <GlassCard>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Users size={20} color={colors.online} />
            <View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Available for 1:1</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                Fans can call you while you wait
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setHostOnline(!hostOnline)}
            style={[
              styles.toggle,
              { backgroundColor: hostOnline ? colors.online : colors.bgSoft },
            ]}
          >
            <Text style={styles.toggleText}>{hostOnline ? 'ON' : 'OFF'}</Text>
          </Pressable>
        </View>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  hello: { fontWeight: '600' },
  name: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  hero: { borderRadius: radii.xl, padding: 20, marginBottom: 14 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 48, fontWeight: '900', marginTop: 4 },
  heroSub: { color: 'rgba(255,255,255,0.8)', marginBottom: 14 },
  heroActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    minHeight: 52,
  },
  secondaryText: { color: '#fff', fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  stat: { width: '48%', alignItems: 'flex-start', gap: 6 },
  statValue: { fontWeight: '900', fontSize: 22 },
  statLabel: { fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { fontWeight: '800' },
  rowSub: { fontSize: 12, marginTop: 2 },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  toggleText: { color: '#fff', fontWeight: '900' },
});
