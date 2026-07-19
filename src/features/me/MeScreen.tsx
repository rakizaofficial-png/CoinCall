import {
  BarChart3,
  ChevronRight,
  CreditCard,
  LogOut,
  Settings,
  UserRound,
  Wallet,
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
import { useAuth } from '../../context/AuthContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import { useTheme } from '../../theme/ThemeContext';
import { premium } from '../../theme/premium';

export function MeScreen({ navigation }: { navigation: any }) {
  const { user, hostEarnings, hostOnline, setHostOnline, callsToday, myTodayMinutes } =
    useApp();
  const { monthlyEarn, todayLiveGiftCoins, liveSeconds } = useLiveStudio();
  const { signOut } = useAuth();
  const { isDark, setScheme } = useTheme();

  const wallet =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    (user.coinBalance || 0);

  const rows = [
    {
      icon: Wallet,
      title: 'Wallet',
      sub: `${wallet} coins available`,
      onPress: () => navigation.navigate('Withdraw'),
    },
    {
      icon: CreditCard,
      title: 'Withdrawal',
      sub: 'Cash out earnings',
      onPress: () => navigation.navigate('Withdraw'),
    },
    {
      icon: BarChart3,
      title: 'Analytics',
      sub: `${callsToday} calls · ${myTodayMinutes}m today`,
      onPress: () => undefined,
    },
    {
      icon: Settings,
      title: 'Settings',
      sub: 'Account · beauty · theme',
      onPress: () => navigation.navigate('Settings'),
    },
    {
      icon: UserRound,
      title: 'Profile',
      sub: user.country || 'Host profile',
      onPress: () => navigation.navigate('Settings'),
    },
  ];

  return (
    <PremiumShell padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BodyText mute style={styles.eyebrow}>
            ACCOUNT
          </BodyText>
          <DisplayText size={30}>Me</DisplayText>
        </View>

        <GlassPanel style={styles.profile} pad={18}>
          <View style={styles.profileRow}>
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <DisplayText size={22}>{user.name}</DisplayText>
              <BodyText soft style={{ marginTop: 2 }}>
                {hostOnline ? 'Online for fans' : 'Offline'} · Lv.{user.level || 1}
              </BodyText>
            </View>
          </View>
          <View style={styles.profileActions}>
            <GradientCTA
              label={hostOnline ? 'Go Offline' : 'Go Online'}
              tone={hostOnline ? 'teal' : 'rose'}
              onPress={() => setHostOnline(!hostOnline)}
              style={{ flex: 1 }}
            />
            <SoftPress
              onPress={() => setScheme(isDark ? 'light' : 'dark')}
              style={styles.themeBtn}
            >
              <BodyText style={{ fontWeight: '800', fontSize: 13 }}>
                {isDark ? 'Light' : 'Dark'}
              </BodyText>
            </SoftPress>
          </View>
        </GlassPanel>

        <View style={styles.stats}>
          <StatChip label="Wallet" value={wallet} accent={premium.gold} />
          <StatChip label="Month" value={monthlyEarn} accent={premium.teal} />
          <StatChip label="Gifts" value={todayLiveGiftCoins} accent={premium.rose} />
          <StatChip
            label="Live"
            value={`${Math.floor(liveSeconds / 60)}m`}
            accent={premium.teal}
          />
        </View>

        <View style={{ paddingHorizontal: 18 }}>
          <SectionLabel title="Earnings" />
          <GlassPanel pad={16} style={{ marginBottom: 8 }}>
            <View style={styles.earnRow}>
              <BodyText mute>Call</BodyText>
              <BodyText style={{ fontWeight: '800' }}>{hostEarnings.call}</BodyText>
            </View>
            <View style={styles.earnRow}>
              <BodyText mute>Gift</BodyText>
              <BodyText style={{ fontWeight: '800' }}>{hostEarnings.gift}</BodyText>
            </View>
            <View style={styles.earnRow}>
              <BodyText mute>Task</BodyText>
              <BodyText style={{ fontWeight: '800' }}>{hostEarnings.task}</BodyText>
            </View>
            <View style={styles.earnRow}>
              <BodyText mute>Invite</BodyText>
              <BodyText style={{ fontWeight: '800' }}>{hostEarnings.invite}</BodyText>
            </View>
            <GradientCTA
              label="Withdraw earnings"
              onPress={() => navigation.navigate('Withdraw')}
              style={{ marginTop: 12 }}
            />
          </GlassPanel>

          <SectionLabel title="Workspace" />
          {rows.map((row) => (
            <SoftPress key={row.title} onPress={row.onPress}>
              <GlassPanel pad={14} style={{ marginBottom: 10 }}>
                <View style={styles.menuRow}>
                  <View style={styles.iconBubble}>
                    <row.icon size={18} color={premium.rose} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <BodyText style={{ fontWeight: '800' }}>{row.title}</BodyText>
                    <BodyText mute style={{ fontSize: 12 }}>
                      {row.sub}
                    </BodyText>
                  </View>
                  <ChevronRight size={18} color={premium.textMute} />
                </View>
              </GlassPanel>
            </SoftPress>
          ))}

          <SoftPress
            onPress={() => void signOut()}
            style={{ marginTop: 8, marginBottom: 24 }}
          >
            <GlassPanel pad={14}>
              <View style={styles.menuRow}>
                <LogOut size={18} color={premium.danger} />
                <BodyText style={{ fontWeight: '800', color: premium.danger, marginLeft: 10 }}>
                  Sign out
                </BodyText>
              </View>
            </GlassPanel>
          </SoftPress>
        </View>
      </ScrollView>
    </PremiumShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  header: { paddingHorizontal: 18, marginBottom: 12 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: premium.teal,
    marginBottom: 4,
  },
  profile: { marginHorizontal: 18, marginBottom: 14 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: premium.lineStrong,
  },
  profileActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  themeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: premium.radius.md,
    borderWidth: 1,
    borderColor: premium.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 18,
  },
  earnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: premium.line,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,77,109,0.12)',
  },
});
