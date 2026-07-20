import {
  BarChart3,
  ChevronRight,
  CreditCard,
  LogOut,
  Settings,
  UserRound,
  Wallet,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
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
import {
  joinAgencyByCode,
  referralCodeFromUrl,
  trackReferralClick,
} from '../../services/agencyJoinService';
import { useTheme } from '../../theme/ThemeContext';
import { premium } from '../../theme/premium';
import { notify } from '../../utils/notify';

export function MeScreen({ navigation }: { navigation: any }) {
  const { user, hostEarnings, hostOnline, setHostOnline, callsToday, myTodayMinutes } =
    useApp();
  const { monthlyEarn, todayLiveGiftCoins, liveSeconds } = useLiveStudio();
  const { signOut } = useAuth();
  const { isDark, setScheme } = useTheme();
  const [agencyCode, setAgencyCode] = useState('');
  const [agencyBusy, setAgencyBusy] = useState(false);
  const [agencyLinked, setAgencyLinked] = useState('');

  const applyReferral = useCallback(
    async (code: string, silent = false) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed || !user?.id) return;
      setAgencyBusy(true);
      try {
        await trackReferralClick(trimmed);
        const res = await joinAgencyByCode(user.id, trimmed);
        if (!res.ok) {
          if (!silent) notify('Agency', res.error);
          return;
        }
        setAgencyLinked(res.agencyName || trimmed);
        setAgencyCode(trimmed);
        notify(
          'Agency linked',
          res.joined
            ? `You joined ${res.agencyName}`
            : `Already with ${res.agencyName}`,
        );
      } catch (e) {
        if (!silent) {
          notify('Agency', e instanceof Error ? e.message : 'Join failed');
        }
      } finally {
        setAgencyBusy(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    void (async () => {
      const initial = await Linking.getInitialURL();
      const code = referralCodeFromUrl(initial);
      if (code) void applyReferral(code, true);
    })();
    sub = Linking.addEventListener('url', ({ url }) => {
      const code = referralCodeFromUrl(url);
      if (code) void applyReferral(code, false);
    });
    return () => sub?.remove();
  }, [applyReferral]);

  const giftCoinsToday = Math.max(hostEarnings.gift, todayLiveGiftCoins);
  const wallet =
    hostEarnings.call +
    giftCoinsToday +
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
      title: 'Edit profile',
      sub: 'Photo · bio · intro video',
      onPress: () => navigation.navigate('EditHostProfile'),
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
          <StatChip label="Gifts" value={giftCoinsToday} accent={premium.rose} />
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
              <BodyText style={{ fontWeight: '800' }}>{giftCoinsToday}</BodyText>
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

          <SectionLabel title="Agency" />
          <GlassPanel pad={16} style={{ marginBottom: 12 }}>
            <BodyText mute style={{ marginBottom: 8, fontSize: 12 }}>
              {agencyLinked
                ? `Linked · ${agencyLinked}`
                : 'Enter your agency invite code to join'}
            </BodyText>
            <TextInput
              value={agencyCode}
              onChangeText={(t) => setAgencyCode(t.toUpperCase())}
              placeholder="e.g. NOVA30"
              placeholderTextColor={premium.textMute}
              autoCapitalize="characters"
              style={styles.agencyInput}
            />
            <GradientCTA
              label={agencyBusy ? 'Joining…' : 'Join agency'}
              onPress={() => void applyReferral(agencyCode)}
              style={{ marginTop: 10, opacity: agencyBusy ? 0.6 : 1 }}
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
  agencyInput: {
    borderWidth: 1,
    borderColor: premium.line,
    borderRadius: premium.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: premium.text,
    fontWeight: '700',
    letterSpacing: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});
