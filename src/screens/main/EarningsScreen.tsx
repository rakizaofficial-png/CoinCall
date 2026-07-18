import { ArrowDownCircle, Building2, Smartphone } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import {
  listHostWithdrawals,
  requestHostWithdrawal,
  type WithdrawalGateway,
} from '../../services/withdrawalService';
import { persistPayoutMethod, syncHostWalletBalance } from '../../services/walletSyncService';
import { pushHostNotification } from '../../services/notificationInboxService';
import { notify } from '../../utils/notify';

type HistoryItem = {
  id: string;
  amountCoins: number;
  gateway: string;
  status: string;
  createdAt: number;
};

export function EarningsScreen() {
  const { colors } = useTheme();
  const {
    user,
    hostEarnings,
    transactions,
    callsToday,
    applyPayout,
  } = useApp();

  const [gateway, setGateway] = useState<WithdrawalGateway>('easypaisa');
  const [accountName, setAccountName] = useState(user.name);
  const [accountNumber, setAccountNumber] = useState(user.phone || '');
  const [amount, setAmount] = useState(String(user.coinBalance || ''));
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const pending =
    hostEarnings.call +
    hostEarnings.gift +
    hostEarnings.task +
    hostEarnings.invite +
    hostEarnings.managed;

  const localHistory = transactions
    .filter((t) => t.type === 'earn' || t.type === 'payout')
    .slice(0, 12);

  const refreshWithdrawals = useCallback(async () => {
    try {
      const data = await listHostWithdrawals(user.id);
      setHistory((data.withdrawals as HistoryItem[]) || []);
    } catch {
      setHistory([]);
    }
  }, [user.id]);

  useEffect(() => {
    void refreshWithdrawals();
    void syncHostWalletBalance({
      hostId: user.id,
      coinBalance: user.coinBalance,
      displayName: user.name,
    });
  }, [refreshWithdrawals, user.coinBalance, user.id, user.name]);

  const onCashOut = async () => {
    const coins = Math.floor(Number(amount) || 0);
    if (coins < 100) {
      notify('Withdraw', 'Minimum cash-out is 100 coins.');
      return;
    }
    if (coins > user.coinBalance) {
      notify('Withdraw', 'Amount exceeds your available balance.');
      return;
    }
    if (!accountName.trim() || accountNumber.trim().length < 8) {
      notify('Withdraw', 'Enter account name and a valid account / mobile number.');
      return;
    }

    setBusy(true);
    try {
      await syncHostWalletBalance({
        hostId: user.id,
        coinBalance: user.coinBalance,
        displayName: user.name,
      });
      await persistPayoutMethod({
        hostId: user.id,
        gateway,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
      });

      const result = await requestHostWithdrawal({
        hostId: user.id,
        amountCoins: coins,
        gateway,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        knownBalance: user.coinBalance,
        displayName: user.name,
      });

      if (!result.ok) {
        notify('Cash-Out failed', result.error || 'Gateway rejected payout');
        return;
      }

      const nextBalance = result.wallet?.coinBalance ?? user.coinBalance - coins;
      applyPayout(coins, gateway, result.withdrawal?.id || '', nextBalance);

      await pushHostNotification(user.id, {
        type: 'payout',
        title: 'Cash-Out submitted',
        body: `${coins} coins via ${gateway} · ${result.withdrawal?.status || 'pending'}`,
      });

      notify(
        'Cash-Out submitted',
        `${coins} coins → ${gateway} (${result.withdrawal?.status || 'pending'})`,
      );
      setAmount(String(Math.max(0, nextBalance)));
      await refreshWithdrawals();
    } catch (e: unknown) {
      notify('Cash-Out error', e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll contentContainerStyle={{ paddingBottom: 110 }}>
      <Text style={[styles.title, { color: colors.text }]}>My Earnings</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Withdraw to EasyPaisa, JazzCash, or bank
      </Text>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>Available balance</Text>
        <Text style={styles.heroValue}>{user.coinBalance}</Text>
        <Text style={styles.heroSub}>coins in your wallet</Text>
      </LinearGradient>

      {pending > 0 ? (
        <View
          style={[
            styles.pendingCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.textSecondary }}>Session earnings today</Text>
          <Text style={[styles.pendingValue, { color: colors.accent }]}>{pending} coins</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        {[
          { v: callsToday, l: 'Calls today' },
          { v: hostEarnings.call, l: 'Call coins' },
          { v: hostEarnings.gift, l: 'Gift coins' },
        ].map((m) => (
          <View
            key={m.l}
            style={[
              styles.mini,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.miniValue, { color: colors.blush }]}>{m.v}</Text>
            <Text style={[styles.miniLabel, { color: colors.textMuted }]}>{m.l}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Cash-Out</Text>
      <View style={styles.gateRow}>
        {(
          [
            { key: 'easypaisa', label: 'EasyPaisa', Icon: Smartphone },
            { key: 'jazzcash', label: 'JazzCash', Icon: Smartphone },
            { key: 'bank', label: 'Bank', Icon: Building2 },
          ] as const
        ).map(({ key, label, Icon }) => {
          const on = gateway === key;
          return (
            <Pressable
              key={key}
              onPress={() => setGateway(key)}
              style={[
                styles.gateChip,
                {
                  backgroundColor: on ? `${colors.primary}33` : colors.bgCard,
                  borderColor: on ? colors.primary : colors.border,
                },
              ]}
            >
              <Icon size={16} color={on ? colors.primarySoft : colors.textMuted} />
              <Text style={{ color: on ? colors.text : colors.textSecondary, fontWeight: '700' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.text },
        ]}
        value={accountName}
        onChangeText={setAccountName}
        placeholder="Account name"
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.text },
        ]}
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder={gateway === 'bank' ? 'IBAN / account number' : 'Mobile wallet number'}
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
      />
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.text },
        ]}
        value={amount}
        onChangeText={setAmount}
        placeholder="Amount in coins"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
      />

      <Pressable
        style={[styles.withdrawBtn, { opacity: busy ? 0.7 : 1 }]}
        onPress={onCashOut}
        disabled={busy}
        accessibilityRole="button"
      >
        <ArrowDownCircle size={22} color={colors.primary} />
        <Text style={[styles.withdrawText, { color: colors.primary }]}>
          {busy ? 'Submitting…' : `Cash-Out · ${gateway}`}
        </Text>
      </Pressable>

      <Text style={[styles.section, { color: colors.text }]}>Withdrawal history</Text>
      {history.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No withdrawals yet.</Text>
      ) : (
        history.map((w) => (
          <View key={w.id} style={[styles.tx, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.txLabel, { color: colors.text }]}>
                {w.gateway} · {w.status}
              </Text>
              <Text style={[styles.txTime, { color: colors.textMuted }]}>
                {new Date(w.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={[styles.txAmount, { color: colors.danger }]}>-{w.amountCoins}</Text>
          </View>
        ))
      )}

      <Text style={[styles.section, { color: colors.text }]}>Session ledger</Text>
      {localHistory.length === 0 ? (
        <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
          No earnings yet. Go Online and take a call.
        </Text>
      ) : (
        localHistory.map((tx) => (
          <View key={tx.id} style={[styles.tx, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.txLabel, { color: colors.text }]}>{tx.label}</Text>
              <Text style={[styles.txTime, { color: colors.textMuted }]}>
                {new Date(tx.timestamp).toLocaleString()}
              </Text>
            </View>
            <Text
              style={[
                styles.txAmount,
                { color: tx.type === 'payout' ? colors.danger : colors.success },
              ]}
            >
              {tx.type === 'payout' ? '-' : '+'}
              {tx.amount}
            </Text>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 6, marginBottom: 18 },
  hero: {
    borderRadius: radii.xl,
    padding: 22,
    alignItems: 'center',
  },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  heroValue: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '800',
    marginTop: 4,
  },
  heroSub: { color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  pendingCard: {
    marginTop: 12,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingValue: { fontWeight: '800', fontSize: 18 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mini: {
    flex: 1,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  miniValue: { fontWeight: '800', fontSize: 20 },
  miniLabel: { marginTop: 4, fontSize: 11 },
  section: {
    fontWeight: '800',
    fontSize: 18,
    marginTop: 24,
    marginBottom: 10,
  },
  gateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  gateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 44,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    fontSize: 16,
    minHeight: 52,
  },
  withdrawBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 18,
    minHeight: 52,
  },
  withdrawText: { fontWeight: '800', fontSize: 16 },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  txLabel: { fontWeight: '600' },
  txTime: { fontSize: 11, marginTop: 2 },
  txAmount: { fontWeight: '800', fontSize: 16 },
});
