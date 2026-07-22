import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BadgeCheck,
  Building2,
  ChevronLeft,
  FileText,
  HelpCircle,
  Server,
  Shield,
  Smartphone,
  UserRound,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GlassCard } from '../../components/ui/GlassCard';
import { Screen } from '../../components/ui/Screen';
import { env } from '../../config/env';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type Props = { navigation: any };

type ServerHealth = {
  ok?: boolean;
  status?: string;
  ts?: number;
};

function Row({
  label,
  value,
  icon: Icon,
  onPress,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const body = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}22` }]}>
        <Icon size={18} color={colors.primarySoft} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.pressRow}>
        {body}
      </Pressable>
    );
  }
  return <View style={styles.pressRow}>{body}</View>;
}

export function SystemInformationScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user, hostOnline } = useApp();
  const { user: authUser } = useAuth();
  const [server, setServer] = useState<ServerHealth | null>(null);
  const [lastLogin, setLastLogin] = useState<string>('—');

  const version =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';
  const build =
    Constants.expoConfig?.android?.versionCode ||
    Constants.nativeBuildVersion ||
    '—';

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const api = (env.apiBaseUrl || '').replace(/\/$/, '');
        const res = await fetch(`${api}/health`);
        const data = (await res.json().catch(() => ({}))) as ServerHealth;
        if (!dead) setServer({ ok: res.ok, ...data });
      } catch {
        if (!dead) setServer({ ok: false, status: 'unreachable' });
      }
    };
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const ts = Number(
      (authUser as { lastLoginAt?: number } | null)?.lastLoginAt ||
        (user as { lastLoginAt?: number }).lastLoginAt ||
        Date.now(),
    );
    setLastLogin(new Date(ts).toLocaleString());
  }, [authUser, user]);

  const accountStatus = authUser?.hostStatus || user.hostStatus || 'unknown';
  const verification = user.isVerified || authUser?.isVerified ? 'Verified' : 'Unverified';
  const agency =
    (user as { agencyName?: string }).agencyName ||
    (authUser as { agencyName?: string } | null)?.agencyName ||
    'Independent';
  const hostId = user.hostId || user.appId || user.id || '—';
  const device = `${Platform.OS} ${String(Platform.Version)} · ${
    Constants.deviceName || 'device'
  }`;
  const serverLabel = server?.ok
    ? `Online${server.status ? ` · ${server.status}` : ''}`
    : server
      ? 'Offline / unreachable'
      : 'Checking…';

  const openUrl = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  const legalBase = (env.apiBaseUrl || 'https://coincall-api.onrender.com/api')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={12}>
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>System Information</Text>
        <View style={{ width: 44 }} />
      </View>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>CoinCall Host</Text>
        <Text style={styles.heroValue}>v{version}</Text>
        <Text style={styles.heroSub}>
          Build {build} · {hostOnline ? 'Online' : 'Offline'}
        </Text>
      </LinearGradient>

      <GlassCard>
        <Row label="App Version" value={`${version} (${build})`} icon={Smartphone} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Host ID" value={String(hostId)} icon={UserRound} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Account Status" value={String(accountStatus)} icon={Shield} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Verification Status" value={verification} icon={BadgeCheck} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Agency Name" value={agency} icon={Building2} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Current Server Status" value={serverLabel} icon={Server} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Last Login" value={lastLogin} icon={UserRound} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="Device Information" value={device} icon={Smartphone} />
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Legal & Help</Text>
      <GlassCard>
        <Row
          label="FAQ"
          value="Open Help Center FAQ"
          icon={HelpCircle}
          onPress={() => navigation.navigate('HelpCenter')}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row
          label="Terms"
          value="View Terms of Service"
          icon={FileText}
          onPress={() => openUrl(`${legalBase}/terms`)}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row
          label="Privacy Policy"
          value="View Privacy Policy"
          icon={Shield}
          onPress={() => openUrl(`${legalBase}/privacy`)}
        />
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  hero: {
    borderRadius: radii.lg,
    padding: 20,
    marginBottom: 16,
  },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 13 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4 },
  heroSub: { color: 'rgba(255,255,255,0.7)', marginTop: 6, fontWeight: '600' },
  section: { fontWeight: '800', fontSize: 16, marginTop: 18, marginBottom: 8 },
  pressRow: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
