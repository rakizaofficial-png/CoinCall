import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  Gift,
  Mic,
  Radio,
  Settings2,
  Users,
  Video,
} from 'lucide-react-native';
import { useMemo } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  BodyText,
  DisplayText,
  GlassPanel,
  GradientCTA,
  PremiumShell,
  SectionLabel,
  SoftPress,
} from '../../components/premium/PremiumChrome';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { premium } from '../../theme/premium';

export function LiveHubScreen({ navigation }: { navigation: any }) {
  const { user, hosts } = useApp();
  const { liveRooms, myLiveRoom, goLiveDraft } = useLiveStudio();

  const rooms = useMemo(() => {
    const map = new Map(liveRooms.filter((r) => r.isLive).map((r) => [r.id, r]));
    if (myLiveRoom?.isLive) map.set(myLiveRoom.id, myLiveRoom);
    for (const h of hosts) {
      if (!h.isLive || h.id === user.id) continue;
      const id = `live_${h.id}`;
      if ([...map.values()].some((r) => r.hostId === h.id)) continue;
      map.set(id, {
        id,
        hostId: h.id,
        hostName: h.name,
        hostAvatar: h.avatarUrl,
        title: `${h.name}'s Live`,
        category: 'Live',
        language: 'English',
        thumbnailUrl: h.avatarUrl,
        channel: id,
        viewers: 12,
        likes: 0,
        giftCoins: 0,
        isLive: true,
        mode: 'solo',
        announcement: '',
        level: h.level || 1,
        badge: 'Host',
        startedAt: Date.now(),
      });
    }
    return [...map.values()];
  }, [hosts, liveRooms, myLiveRoom, user.id]);

  return (
    <PremiumShell padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <BodyText mute style={styles.eyebrow}>
              STAGE
            </BodyText>
            <DisplayText size={30}>Live Studio</DisplayText>
          </View>
          <SoftPress onPress={() => navigation.navigate('Settings')}>
            <GlassPanel pad={12}>
              <Settings2 size={18} color={premium.textSoft} />
            </GlassPanel>
          </SoftPress>
        </View>

        <LinearGradient
          colors={['#241018', '#102028', '#0A0E14']}
          style={styles.preview}
        >
          <View style={styles.previewTop}>
            <View style={styles.livePill}>
              <Radio size={12} color="#fff" />
              <BodyText style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>
                {myLiveRoom?.isLive ? 'ON AIR' : 'PREVIEW'}
              </BodyText>
            </View>
            <BodyText soft style={{ fontSize: 12 }}>
              Beauty · gifts · chat ready
            </BodyText>
          </View>
          <View style={styles.previewCenter}>
            <Camera size={36} color={premium.textSoft} />
            <BodyText soft style={{ marginTop: 8, textAlign: 'center' }}>
              {goLiveDraft.title || `${user.name}'s stage`}
            </BodyText>
          </View>
          <View style={styles.previewActions}>
            <GradientCTA
              label={myLiveRoom?.isLive ? 'Open Stage' : 'Go Live'}
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
            <GradientCTA
              label="Party Room"
              tone="teal"
              onPress={() => navigation.navigate('GoLive', { mode: 'party' })}
              style={{ flex: 1 }}
            />
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 18 }}>
          <SectionLabel title="Live management" />
          <View style={styles.mgmt}>
            {[
              {
                icon: Video,
                title: 'Solo Live',
                sub: '1 camera · gifts',
                onPress: () => navigation.navigate('GoLive', { mode: 'solo' }),
              },
              {
                icon: Users,
                title: 'Party Room',
                sub: 'Seats · room chat',
                onPress: () => navigation.navigate('GoLive', { mode: 'party' }),
              },
              {
                icon: Gift,
                title: 'Gift system',
                sub: 'Catalog on stage',
                onPress: () =>
                  myLiveRoom?.isLive
                    ? navigation.navigate('LiveRoom', {
                        roomId: myLiveRoom.id,
                        hostMode: true,
                      })
                    : navigation.navigate('GoLive', { mode: 'solo' }),
              },
              {
                icon: Mic,
                title: 'Room controls',
                sub: 'Mute · kick · pin',
                onPress: () =>
                  myLiveRoom?.isLive
                    ? navigation.navigate('LiveRoom', {
                        roomId: myLiveRoom.id,
                        hostMode: true,
                      })
                    : undefined,
              },
            ].map((item) => (
              <SoftPress key={item.title} onPress={item.onPress} style={{ width: '48%' }}>
                <GlassPanel pad={14} style={{ marginBottom: 10, minHeight: 108 }}>
                  <item.icon size={20} color={premium.teal} />
                  <BodyText style={{ fontWeight: '800', marginTop: 10 }}>{item.title}</BodyText>
                  <BodyText mute style={{ fontSize: 12, marginTop: 2 }}>
                    {item.sub}
                  </BodyText>
                </GlassPanel>
              </SoftPress>
            ))}
          </View>

          <SectionLabel title="Live rooms" action={`${rooms.length} live`} />
        </View>

        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          numColumns={2}
          scrollEnabled={false}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 18 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: 18 }}>
              <GlassPanel>
                <Users size={22} color={premium.rose} />
                <BodyText style={{ fontWeight: '800', marginTop: 8 }}>No rooms yet</BodyText>
                <BodyText soft style={{ marginTop: 4 }}>
                  Start Solo Live or Party — other hosts will appear here.
                </BodyText>
              </GlassPanel>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.hostId === user.id;
            return (
              <SoftPress
                style={{ flex: 1 }}
                onPress={() =>
                  navigation.navigate('LiveRoom', {
                    roomId: item.id,
                    hostMode: mine,
                  })
                }
              >
                <View style={styles.card}>
                  <Image
                    source={{ uri: item.thumbnailUrl || item.hostAvatar }}
                    style={styles.cover}
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.88)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.badge}>
                    <BodyText style={styles.badgeText}>
                      {item.mode === 'party' ? 'PARTY' : 'LIVE'}
                    </BodyText>
                  </View>
                  {mine ? (
                    <View style={styles.you}>
                      <BodyText style={styles.youText}>YOU</BodyText>
                    </View>
                  ) : null}
                  <View style={styles.meta}>
                    <BodyText style={{ fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
                      {item.title}
                    </BodyText>
                    <BodyText mute style={{ fontSize: 11 }} numberOfLines={1}>
                      {item.hostName} · {item.viewers} viewers
                    </BodyText>
                  </View>
                </View>
              </SoftPress>
            );
          }}
        />
      </ScrollView>
    </PremiumShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: premium.teal,
    marginBottom: 4,
  },
  preview: {
    marginHorizontal: 18,
    borderRadius: premium.radius.xl,
    padding: 18,
    minHeight: 240,
    borderWidth: 1,
    borderColor: premium.line,
    justifyContent: 'space-between',
  },
  previewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: premium.roseDeep,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  previewCenter: { alignItems: 'center', paddingVertical: 24 },
  previewActions: { flexDirection: 'row', gap: 10 },
  mgmt: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    height: 210,
    borderRadius: premium.radius.lg,
    overflow: 'hidden',
    backgroundColor: premium.inkSoft,
    borderWidth: 1,
    borderColor: premium.line,
  },
  cover: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: premium.roseDeep,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 10 },
  you: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: premium.teal,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  youText: { color: premium.ink, fontWeight: '900', fontSize: 10 },
  meta: { position: 'absolute', left: 10, right: 10, bottom: 12 },
});
