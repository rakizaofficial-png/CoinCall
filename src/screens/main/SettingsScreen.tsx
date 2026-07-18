import { ChevronLeft, LogOut, Moon, Sun, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/ui/GlassCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { persistPayoutMethod } from '../../services/walletSyncService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';
import type { WithdrawalGateway } from '../../services/withdrawalService';

export function SettingsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, preference, setScheme } = useTheme();
  const { user, hostOnline, setHostOnline } = useApp();
  const { signOut } = useAuth();
  const [gateway, setGateway] = useState<WithdrawalGateway>('easypaisa');
  const [accountName, setAccountName] = useState(user.name);
  const [accountNumber, setAccountNumber] = useState(user.phone || '');
  const [callAlerts, setCallAlerts] = useState(true);
  const [payoutAlerts, setPayoutAlerts] = useState(true);
  const [saving, setSaving] = useState(false);

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

      <Text style={[styles.section, { color: colors.text }]}>Appearance</Text>
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

      <Text style={[styles.section, { color: colors.text }]}>Notification preferences</Text>
      <GlassCard>
        <View style={styles.row}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Incoming call alerts</Text>
          <Switch
            value={callAlerts}
            onValueChange={setCallAlerts}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.row}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Payout updates</Text>
          <Switch
            value={payoutAlerts}
            onValueChange={setPayoutAlerts}
            trackColor={{ false: colors.border, true: colors.primarySoft }}
            thumbColor="#fff"
          />
        </View>
      </GlassCard>

      <Text style={[styles.section, { color: colors.text }]}>Payout method</Text>
      <GlassCard>
        <View style={styles.gateRow}>
          {(['easypaisa', 'jazzcash', 'bank'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => setGateway(g)}
              style={[
                styles.gateChip,
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
          onPress={savePayout}
          loading={saving}
        />
      </GlassCard>

      <Pressable
        style={[styles.linkRow, { borderColor: colors.border }]}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Earnings' })}
      >
        <Wallet size={18} color={colors.primarySoft} />
        <Text style={[styles.linkText, { color: colors.text }]}>Open wallet & cash-out</Text>
      </Pressable>

      <Pressable
        style={[styles.signOut, { borderColor: colors.danger }]}
        onPress={signOut}
      >
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
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontWeight: '700', fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  gateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  gateChip: {
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
