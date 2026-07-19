import { LinearGradient } from 'expo-linear-gradient';
import {
  Clock,
  Gift,
  Heart,
  Radio,
  Search,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/ui/Avatar';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { env } from '../../config/env';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

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
  const [appIdQuery, setAppIdQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);

  const todayEarn =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    todayLiveGiftCoins;

  const searchByAppId = async () => {
    const q = appIdQuery.trim().replace(/\D/g, '');
    if (!/^\d{6}$/.test(q)) {
      notify('Search', 'Enter a 6-digit app ID');
      return;
    }
    setSearchBusy(true);
    try {
      const api = env.apiBaseUrl.replace(/\/$/, '');
      const res = await fetch(
        `${api}/profiles/search?appId=${encodeURIComponent(q)}`,
      );
      const data = (await res.json()) as {
        error?: string;
        profile?: {
          userId: string;
          displayName: string;
          avatarUrl?: string;
          role: string;
        };
      };
      if (!res.ok || !data.profile) {
        notify('User not found', data.error || 'No profile for that ID');
        return;
      }
      const p = data.profile;
      notify('Found', `${p.displayName} · ${p.role}`);
      if (p.role === 'user') {
        navigation.navigate('DirectChat', {
          peerId: p.userId,
          peerName: p.displayName,
          peerAvatar: p.avatarUrl,
        });
      } else {
        navigation.navigate('HostProfile', { hostId: p.userId });
      }
    } catch (e) {
      notify('Search failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSearchBusy(false);
    }
  };

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
          {user.appId ? (
            <Text style={[styles.appId, { color: colors.textMuted }]}>
              ID {user.appId}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => navigation.navigate('Profile')}>
          <Avatar uri={user.avatarUrl} size={52} online={hostOnline} ring />
        </Pressable>
      </View>

      <View
        style={[
          styles.searchRow,
          { backgroundColor: colors.bgCard, borderColor: colors.border },
        ]}
      >
        <Search size={16} color={colors.textMuted} />
        <TextInput
          value={appIdQuery}
          onChangeText={setAppIdQuery}
          placeholder="Search 6-digit ID…"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          style={[styles.searchInput, { color: colors.text }]}
          onSubmitEditing={() => void searchByAppId()}
        />
        <Pressable onPress={() => void searchByAppId()} disabled={searchBusy}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>
            {searchBusy ? '…' : 'Go'}
          </Text>
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
        <Text style={styles.heroSub}>
          calls {hostEarnings.call} · gifts{' '}
          {hostEarnings.gift + todayLiveGiftCoins} · wallet {user.coinBalance}
        </Text>
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

      <Pressable onPress={() => navigation.navigate('Earnings')}>
        <GlassCard>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Call Analytics & Revenue</Text>
          <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
            Total calls, duration, call coins, gifts with sender details — open Earnings
          </Text>
        </GlassCard>
      </Pressable>

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
  appId: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
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
