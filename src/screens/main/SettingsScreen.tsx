import {
  ChevronLeft,
  Eye,
  Headphones,
  Info,
  Languages,
  LogOut,
  Moon,
  Shield,
  Sparkles,
  Sun,
  Video,
  Wallet,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { LIVE_LANGUAGES } from '../../data/gifts';
import {
  DEFAULT_LIVE_CALL_SETTINGS,
  loadLiveCallSettings,
  saveLiveCallSettings,
  type LiveCallSettings,
} from '../../services/liveCallSettings';
import { persistPayoutMethod } from '../../services/walletSyncService';
import type { WithdrawalGateway } from '../../services/withdrawalService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';

const QUALITIES = ['360p', '480p', '720p', '1080p'] as const;

export function SettingsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, preference, setScheme } = useTheme();
  const {
    user,
    hostOnline,
    setHostOnline,
    beautyOn,
    runHostTool,
    blockedIds,
  } = useApp();
  const { signOut } = useAuth();
  const [gateway, setGateway] = useState<WithdrawalGateway>('easypaisa');
  const [accountName, setAccountName] = useState(user.name);
  const [accountNumber, setAccountNumber] = useState(user.phone || '');
  const [callAlerts, setCallAlerts] = useState(true);
  const [giftAlerts, setGiftAlerts] = useState(true);
  const [payoutAlerts, setPayoutAlerts] = useState(true);
  const [roomAlerts, setRoomAlerts] = useState(true);
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>('720p');
  const [appLanguage, setAppLanguage] = useState('English');
  const [hideOnline, setHideOnline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveCall, setLiveCall] = useState<LiveCallSettings>(DEFAULT_LIVE_CALL_SETTINGS);

  useEffect(() => {
    void loadLiveCallSettings().then(setLiveCall);
  }, []);

  const patchLiveCall = async (patch: Partial<LiveCallSettings>) => {
    const next = await saveLiveCallSettings(patch);
    setLiveCall(next);
    notify('Saved', 'Live call settings updated');
  };

  const cycleTheme = () => {
    if (preference === 'system') setScheme('dark');
    else if (preference === 'dark') setScheme('light');
    else setScheme('system');
  };

  const themeLabel =
    preference === 'system' ? 'System' : preference === 'dark' ? 'Dark' : 'Light';

  const savePayout = async () => {
    if (!accountName.trim() || accountNumber.trim().length < 8) {
      notify('Payout method', 'Enter a valid account name and number.');
      return;
    }
    setSaving(true);
    try {
      await persistPayoutMethod({
        hostId: user.id,
        gateway,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
      });
      notify('Saved', 'Payout method updated.');
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={12}>
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Beauty</Text>
      <GlassCard>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Sparkles size={20} color={colors.accent} />
            <View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Beauty filter</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                Soft skin + glow on live preview
              </Text>
            </View>
          </View>
          <Switch
            value={beautyOn}
            onValueChange={() => runHostTool('beauty')}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Streaming quality</Text>
      <GlassCard>
        <View style={styles.chipRow}>
          {QUALITIES.map((q) => (
            <Pressable
              key={q}
              onPress={() => {
                setQuality(q);
                notify('Quality', `Streaming set to ${q}`);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: quality === q ? `${colors.primary}44` : colors.bgSoft,
                  borderColor: quality === q ? colors.primary : colors.border,
                },
              ]}
            >
              <Video size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{q}</Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Availability</Text>
      <GlassCard>
        <View style={styles.row}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Available for calls</Text>
          <Switch
            value={hostOnline}
            onValueChange={(v) => setHostOnline(v)}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Live + Video Calls</Text>
      <GlassCard>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              Accept calls while LIVE
            </Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              Show premium incoming popup during live
            </Text>
          </View>
          <Switch
            value={liveCall.acceptCallsWhileLive}
            onValueChange={(v) => void patchLiveCall({ acceptCallsWhileLive: v })}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Auto-reject if busy</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              Decline new rings during an active private call
            </Text>
          </View>
          <Switch
            value={liveCall.autoRejectWhenBusy}
            onValueChange={(v) => void patchLiveCall({ autoRejectWhenBusy: v })}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.rowTitle, { color: colors.text, marginBottom: 8 }]}>
          Coins per minute
        </Text>
        <View style={styles.chipRow}>
          {[50, 80, 100, 150, 200].map((n) => (
            <Pressable
              key={n}
              onPress={() => void patchLiveCall({ coinsPerMinute: n })}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    liveCall.coinsPerMinute === n ? `${colors.primary}44` : colors.bgSoft,
                  borderColor:
                    liveCall.coinsPerMinute === n ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border, marginTop: 12 }]} />
        <Text style={[styles.rowTitle, { color: colors.text, marginBottom: 8 }]}>
          Max waiting time
        </Text>
        <View style={styles.chipRow}>
          {[20, 30, 45, 60, 90].map((n) => (
            <Pressable
              key={n}
              onPress={() => void patchLiveCall({ maxWaitSec: n })}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    liveCall.maxWaitSec === n ? `${colors.primary}44` : colors.bgSoft,
                  borderColor: liveCall.maxWaitSec === n ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>{n}s</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border, marginTop: 12 }]} />
        <Text style={[styles.rowTitle, { color: colors.text, marginBottom: 8 }]}>
          Call availability status
        </Text>
        <View style={styles.chipRow}>
          {(['available', 'busy', 'offline'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => void patchLiveCall({ callAvailability: s })}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    liveCall.callAvailability === s ? `${colors.primary}44` : colors.bgSoft,
                  borderColor:
                    liveCall.callAvailability === s ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Notifications</Text>
      <GlassCard>
        {(
          [
            ['Incoming calls', callAlerts, setCallAlerts],
            ['Gifts received', giftAlerts, setGiftAlerts],
            ['Room joined', roomAlerts, setRoomAlerts],
            ['Withdrawal updates', payoutAlerts, setPayoutAlerts],
          ] as const
        ).map(([label, value, set], i) => (
          <View key={label}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
            <View style={styles.row}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{label}</Text>
              <Switch
                value={value}
                onValueChange={set}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor="#fff"
              />
            </View>
          </View>
        ))}
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Privacy</Text>
      <GlassCard>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Eye size={20} color={colors.textSecondary} />
            <Text style={[styles.rowTitle, { color: colors.text }]}>Hide online status</Text>
          </View>
          <Switch
            value={hideOnline}
            onValueChange={setHideOnline}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Blocked users</Text>
      <GlassCard>
        {blockedIds.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No blocked users</Text>
        ) : (
          blockedIds.map((id) => (
            <View key={id} style={styles.row}>
              <Shield size={18} color={colors.danger} />
              <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{id}</Text>
            </View>
          ))
        )}
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Language</Text>
      <GlassCard>
        <View style={styles.chipRow}>
          {LIVE_LANGUAGES.map((l) => (
            <Pressable
              key={l}
              onPress={() => setAppLanguage(l)}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    appLanguage === l ? `${colors.primary}44` : colors.bgSoft,
                  borderColor: appLanguage === l ? colors.primary : colors.border,
                },
              ]}
            >
              <Languages size={12} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Dark Mode</Text>
      <GlassCard>
        <Pressable style={styles.row} onPress={cycleTheme}>
          <View style={styles.rowLeft}>
            {isDark ? (
              <Moon size={20} color={colors.primarySoft} />
            ) : (
              <Sun size={20} color={colors.accent} />
            )}
            <View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Theme</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{themeLabel}</Text>
            </View>
          </View>
        </Pressable>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Payout method</Text>
      <GlassCard>
        <View style={styles.chipRow}>
          {(['easypaisa', 'jazzcash', 'bank'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => setGateway(g)}
              style={[
                styles.chip,
                {
                  backgroundColor: gateway === g ? `${colors.primary}33` : colors.bgSoft,
                  borderColor: gateway === g ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{g}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.bgSoft, borderColor: colors.border, color: colors.text },
          ]}
          value={accountName}
          onChangeText={setAccountName}
          placeholder="Account name"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.bgSoft, borderColor: colors.border, color: colors.text },
          ]}
          value={accountNumber}
          onChangeText={setAccountNumber}
          placeholder="Account / mobile number"
          placeholderTextColor={colors.textMuted}
        />
        <PrimaryButton
          label={saving ? 'Saving…' : 'Save payout method'}
          onPress={() => void savePayout()}
          loading={saving}
        />
      </GlassCard>

      <Pressable
        style={[styles.linkRow, { borderColor: colors.border }]}
        onPress={() => navigation.navigate('SystemInformation')}
      >
        <Info size={18} color={colors.primarySoft} />
        <Text style={[styles.linkText, { color: colors.text }]}>System information</Text>
      </Pressable>

      <Pressable
        style={[styles.linkRow, { borderColor: colors.border }]}
        onPress={() => navigation.navigate('HelpCenter')}
      >
        <Headphones size={18} color={colors.primarySoft} />
        <Text style={[styles.linkText, { color: colors.text }]}>Help Center</Text>
      </Pressable>

      <Pressable
        style={[styles.linkRow, { borderColor: colors.border }]}
        onPress={() => navigation.navigate('Withdraw')}
      >
        <Wallet size={18} color={colors.primarySoft} />
        <Text style={[styles.linkText, { color: colors.text }]}>Open withdraw</Text>
      </Pressable>

      <Pressable style={[styles.signOut, { borderColor: colors.danger }]} onPress={signOut}>
        <LogOut size={18} color={colors.danger} />
        <Text style={{ color: colors.danger, fontWeight: '800' }}>Sign Out</Text>
      </Pressable>
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
  section: { fontWeight: '800', fontSize: 16, marginTop: 18, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 6,
    gap: 10,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { fontWeight: '700', fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 10,
    minHeight: 48,
  },
  linkRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 52,
  },
  linkText: { fontWeight: '700' },
  signOut: {
    marginTop: 28,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
  },
});
