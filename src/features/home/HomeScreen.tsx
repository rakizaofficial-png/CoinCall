import { LinearGradient } from 'expo-linear-gradient';
import {
  Radio,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  Wallet,
  Zap,
} from 'lucide-react-native';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import {
  BodyText,
  DisplayText,
  GlassPanel,
  GradientCTA,
  PremiumShell,
  SectionLabel,
  SoftPress,
  StatChip,
} from '../../components/premium/PremiumChrome';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { premium, premiumSpace } from '../../theme/premium';

export function HomeScreen({ navigation }: { navigation: any }) {
  const {
    user,
    hosts,
    hostOnline,
    setHostOnline,
    callsToday,
    myTodayMinutes,
    hostEarnings,
  } = useApp();
  const { liveRooms, myLiveRoom, todayLiveGiftCoins, monthlyEarn } = useLiveStudio();

  const onlineHosts = hosts.filter((h) => h.isOnline || h.isLive).slice(0, 8);
  const liveNow = liveRooms.filter((r) => r.isLive).slice(0, 6);
  const todayEarn =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    todayLiveGiftCoins;

  return (
    <PremiumShell padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <BodyText mute style={styles.brand}>
              COINCALL HOST
            </BodyText>
            <DisplayText size={28}>Hey, {user.name.split(' ')[0]}</DisplayText>
            <BodyText soft style={{ marginTop: 4 }}>
              {hostOnline ? 'Visible to fans · ready for 1v1' : 'Offline · go online to earn'}
            </BodyText>
          </View>
          <SoftPress onPress={() => navigation.navigate('Me')}>
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            <View
              style={[
                styles.dot,
                { backgroundColor: hostOnline ? premium.success : premium.textMute },
              ]}
            />
          </SoftPress>
        </View>

        <LinearGradient
          colors={['#2A1520', '#121820', '#0A1018']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <BodyText style={styles.heroEyebrow}>TODAY</BodyText>
          <DisplayText size={40} style={{ color: '#FFF6F0' }}>
            {todayEarn}
          </DisplayText>
          <BodyText soft>coins earned · month {monthlyEarn}</BodyText>
          <View style={styles.heroRow}>
            <GradientCTA
              label={myLiveRoom?.isLive ? 'Return Live' : 'Go Live'}
              onPress={() =>
                myLiveRoom?.isLive
                  ? navigation.navigate('LiveRoom', {
                      roomId: myLiveRoom.id,
                      hostMode: true,
                    })
                  : navigation.navigate('GoLive', { mode: 'solo' })
              }
              style={{ flex: 1 }}
            />
            <SoftPress
              onPress={() => setHostOnline(!hostOnline)}
              style={styles.onlineBtn}
            >
              <Zap size={16} color={hostOnline ? premium.ink : premium.teal} />
              <BodyText
                style={{
                  color: hostOnline ? premium.ink : premium.teal,
                  fontWeight: '800',
                  fontSize: 13,
                }}
              >
                {hostOnline ? 'Online' : 'Go Online'}
              </BodyText>
            </SoftPress>
          </View>
        </LinearGradient>

        <View style={styles.stats}>
          <StatChip label="Calls" value={callsToday} accent={premium.rose} />
          <StatChip label="Minutes" value={myTodayMinutes} accent={premium.teal} />
          <StatChip label="Gifts" value={todayLiveGiftCoins} accent={premium.gold} />
          <StatChip
            label="Live"
            value={liveNow.length}
            accent={premium.rose}
          />
        </View>

        <View style={{ paddingHorizontal: 18 }}>
          <SectionLabel
            title="Quick actions"
            action="All"
            onAction={() => navigation.navigate('Live')}
          />
          <View style={styles.actions}>
            {[
              {
                icon: Video,
                label: 'Solo Live',
                sub: 'Camera stage',
                onPress: () => navigation.navigate('GoLive', { mode: 'solo' }),
              },
              {
                icon: Users,
                label: 'Party',
                sub: 'Multi-seat',
                onPress: () => navigation.navigate('GoLive', { mode: 'party' }),
              },
              {
                icon: Sparkles,
                label: 'Messages',
                sub: 'Inbox',
                onPress: () => navigation.navigate('Messages'),
              },
              {
                icon: Wallet,
                label: 'Withdraw',
                sub: 'Cash out',
                onPress: () => navigation.navigate('Withdraw'),
              },
            ].map((a) => (
              <SoftPress key={a.label} onPress={a.onPress} style={{ width: '48%' }}>
                <GlassPanel pad={14} style={{ marginBottom: 10 }}>
                  <a.icon size={20} color={premium.rose} />
                  <BodyText style={{ fontWeight: '800', marginTop: 10 }}>{a.label}</BodyText>
                  <BodyText mute style={{ fontSize: 12, marginTop: 2 }}>
                    {a.sub}
                  </BodyText>
                </GlassPanel>
              </SoftPress>
            ))}
          </View>

          <SectionLabel
            title="Live now"
            action="Discover"
            onAction={() => navigation.navigate('Live')}
          />
          {liveNow.length === 0 ? (
            <GlassPanel>
              <BodyText soft>No live rooms yet — be the first on stage.</BodyText>
            </GlassPanel>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {liveNow.map((room) => (
                <SoftPress
                  key={room.id}
                  onPress={() =>
                    navigation.navigate('LiveRoom', {
                      roomId: room.id,
                      hostMode: room.hostId === user.id,
                    })
                  }
                >
                  <View style={styles.liveCard}>
                    <Image
                      source={{ uri: room.thumbnailUrl || room.hostAvatar }}
                      style={styles.liveCover}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.85)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.liveBadge}>
                      <Radio size={10} color="#fff" />
                      <BodyText style={styles.liveBadgeText}>LIVE</BodyText>
                    </View>
                    <View style={styles.liveMeta}>
                      <BodyText style={{ fontWeight: '800', fontSize: 13 }} numberOfLines={1}>
                        {room.title}
                      </BodyText>
                      <BodyText mute style={{ fontSize: 11 }}>
                        {room.viewers} watching
                      </BodyText>
                    </View>
                  </View>
                </SoftPress>
              ))}
            </ScrollView>
          )}

          <SectionLabel title="Online hosts" />
          <View style={{ gap: 10, paddingBottom: 28 }}>
            {onlineHosts.length === 0 ? (
              <GlassPanel>
                <BodyText soft>Hosts appear here when they go online.</BodyText>
              </GlassPanel>
            ) : (
              onlineHosts.map((h) => (
                <SoftPress
                  key={h.id}
                  onPress={() => navigation.navigate('HostProfile', { hostId: h.id })}
                >
                  <GlassPanel pad={12}>
                    <View style={styles.hostRow}>
                      <Image source={{ uri: h.avatarUrl }} style={styles.hostAvatar} />
                      <View style={{ flex: 1 }}>
                        <BodyText style={{ fontWeight: '800' }}>{h.name}</BodyText>
                        <BodyText mute style={{ fontSize: 12 }}>
                          {h.country || 'Host'} · {h.isLive ? 'Live' : h.isOnCall ? 'On call' : 'Waiting'}
                        </BodyText>
                      </View>
                      <TrendingUp size={16} color={premium.teal} />
                    </View>
                  </GlassPanel>
                </SoftPress>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </PremiumShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 16,
    gap: 12,
  },
  brand: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: premium.rose,
    marginBottom: 4,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: premium.lineStrong,
  },
  dot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: premium.ink,
  },
  hero: {
    marginHorizontal: 18,
    borderRadius: premium.radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: premium.line,
    overflow: 'hidden',
  },
  heroEyebrow: {
    color: premium.gold,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' },
  onlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(45,212,191,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: premium.radius.md,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 18,
    marginTop: 16,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  liveCard: {
    width: 148,
    height: 200,
    borderRadius: premium.radius.lg,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: premium.inkSoft,
    borderWidth: 1,
    borderColor: premium.line,
  },
  liveCover: { width: '100%', height: '100%' },
  liveBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: premium.roseDeep,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  liveMeta: { position: 'absolute', left: 10, right: 10, bottom: 12 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hostAvatar: { width: 44, height: 44, borderRadius: 14 },
});
