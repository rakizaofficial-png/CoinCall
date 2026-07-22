import { Building2, History, Smartphone, Wallet } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import { pushHostNotification } from '../../services/notificationInboxService';
import { persistPayoutMethod, syncHostWalletBalance } from '../../services/walletSyncService';
import {
  listHostWithdrawals,
  requestHostWithdrawal,
  type WithdrawalGateway,
} from '../../services/withdrawalService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { notify } from '../../utils/notify';
import {
  WithdrawPremiumModal,
  type WithdrawModalState,
} from './WithdrawPremiumModal';

type HistoryItem = {
  id: string;
  amountCoins: number;
  gateway: string;
  status: string;
  createdAt: number;
};

const GATES: { key: WithdrawalGateway | 'crypto'; label: string; Icon: any }[] = [
  { key: 'easypaisa', label: 'EasyPaisa', Icon: Smartphone },
  { key: 'jazzcash', label: 'JazzCash', Icon: Smartphone },
  { key: 'bank', label: 'Bank', Icon: Building2 },
  { key: 'crypto', label: 'Crypto', Icon: Wallet },
];

export function WithdrawScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, applyPayout } = useApp();
  const [gateway, setGateway] = useState<WithdrawalGateway | 'crypto'>('easypaisa');
  const [accountName, setAccountName] = useState(user.name);
  const [accountNumber, setAccountNumber] = useState(user.phone || '');
  const [amount, setAmount] = useState(String(Math.min(user.coinBalance, 500) || ''));
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'failed'>('all');
  const [modal, setModal] = useState<WithdrawModalState>({ visible: false });

  const refresh = useCallback(async () => {
    try {
      const data = await listHostWithdrawals(user.id);
      setHistory((data.withdrawals as HistoryItem[]) || []);
    } catch {
      setHistory([]);
    }
  }, [user.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sendOtp = () => {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    setOtpCode(code);
    setOtpSent(true);
    setOtp(code);
    setModal({
      visible: true,
      mode: 'otp',
      title: 'Verify withdrawal',
      message: 'Enter this one-time code to protect your cash-out.',
      otpHint: code,
      amountCoins: Math.floor(Number(amount) || 0) || undefined,
    });
  };

  const submit = async () => {
    const coins = Math.floor(Number(amount) || 0);
    if (coins < 100) {
      notify('Withdraw', 'Minimum is 100 coins.');
      return;
    }
    if (coins > user.coinBalance) {
      notify('Withdraw', 'Not enough balance.');
      return;
    }
    if (!accountName.trim() || accountNumber.trim().length < 6) {
      notify('Withdraw', 'Enter valid payout details.');
      return;
    }
    if (!otpSent) {
      sendOtp();
      return;
    }
    if (otp.trim() !== otpCode) {
      notify('OTP', 'Incorrect verification code.');
      return;
    }

    const apiGateway: WithdrawalGateway =
      gateway === 'crypto' ? 'bank' : gateway;

    setBusy(true);
    try {
      await syncHostWalletBalance({
        hostId: user.id,
        coinBalance: user.coinBalance,
        displayName: user.name,
      });
      await persistPayoutMethod({
        hostId: user.id,
        gateway: apiGateway,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
      });
      const result = await requestHostWithdrawal({
        hostId: user.id,
        amountCoins: coins,
        gateway: apiGateway,
        accountName: accountName.trim(),
        accountNumber:
          gateway === 'crypto' ? `CRYPTO:${accountNumber.trim()}` : accountNumber.trim(),
        knownBalance: user.coinBalance,
        displayName: user.name,
      });
      if (!result.ok) {
        setModal({
          visible: true,
          mode: 'error',
          title: 'Withdrawal failed',
          message: result.error || 'Payout rejected by server.',
          amountCoins: coins,
        });
        return;
      }
      const next = result.wallet?.coinBalance ?? user.coinBalance - coins;
      applyPayout(coins, gateway, result.withdrawal?.id || '', next);
      await pushHostNotification(user.id, {
        type: 'payout',
        title: 'Withdrawal submitted',
        body: `${coins} coins via ${gateway} · ${result.withdrawal?.status}`,
      });
      setModal({
        visible: true,
        mode: 'success',
        title: 'Submitted successfully',
        message: `Status: ${result.withdrawal?.status}. Coins reserved pending admin review.`,
        amountCoins: coins,
      });
      setOtp('');
      setOtpSent(false);
      setAmount(String(Math.max(0, next)));
      await refresh();
    } catch (e) {
      setModal({
        visible: true,
        mode: 'error',
        title: 'Network error',
        message: e instanceof Error ? e.message : 'Could not reach payout server.',
      });
    } finally {
      setBusy(false);
    }
  };

  const filtered = history.filter((h) => {
    if (filter === 'all') return true;
    if (filter === 'pending') {
      return ['pending', 'processing', 'admin_review'].includes(h.status);
    }
    if (filter === 'paid') return h.status === 'paid';
    return h.status === 'failed' || h.status === 'rejected';
  });

  return (
    <>
    <Screen
      scroll
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
    >
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={{ color: colors.primarySoft, fontWeight: '800' }}>← Back</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Withdraw</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Professional cash-out · OTP protected
      </Text>

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>Available</Text>
        <Text style={styles.heroValue}>{user.coinBalance}</Text>
        <Text style={styles.heroSub}>coins</Text>
      </LinearGradient>

      <View style={styles.gates}>
        {GATES.map(({ key, label, Icon }) => {
          const on = gateway === key;
          return (
            <Pressable
              key={key}
              onPress={() => setGateway(key)}
              style={[
                styles.gate,
                {
                  backgroundColor: on ? `${colors.primary}40` : colors.bgCard,
                  borderColor: on ? colors.primary : colors.border,
                },
              ]}
            >
              <Icon size={16} color={on ? colors.primarySoft : colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bgCard }]}
        value={accountName}
        onChangeText={setAccountName}
        placeholder="Account name"
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bgCard }]}
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder={
          gateway === 'crypto'
            ? 'Wallet address'
            : gateway === 'bank'
              ? 'IBAN / account'
              : 'Mobile wallet number'
        }
        placeholderTextColor={colors.textMuted}
      />
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bgCard }]}
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
        placeholder="Amount (coins)"
        placeholderTextColor={colors.textMuted}
      />
      {otpSent ? (
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bgCard }]}
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          placeholder="Enter OTP"
          placeholderTextColor={colors.textMuted}
        />
      ) : null}

      <Pressable
        style={[styles.submit, { opacity: busy ? 0.7 : 1 }]}
        onPress={submit}
        disabled={busy}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientMid]}
          style={styles.submitGrad}
        >
          <Text style={styles.submitText}>
            {busy ? 'Processing…' : otpSent ? 'Confirm withdrawal' : 'Send OTP & continue'}
          </Text>
        </LinearGradient>
      </Pressable>

      <View style={styles.filters}>
        {(['all', 'pending', 'paid', 'failed'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filter,
              {
                backgroundColor: filter === f ? colors.primary : colors.bgCard,
              },
            ]}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.histHead}>
        <History size={16} color={colors.textMuted} />
        <Text style={[styles.section, { color: colors.text }]}>History</Text>
      </View>
      {filtered.length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>No withdrawals in this filter.</Text>
      ) : (
        filtered.map((h) => (
          <View
            key={h.id}
            style={[styles.row, { borderColor: colors.border, backgroundColor: colors.bgCard }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>
                {h.gateway} · {h.status}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {new Date(h.createdAt).toLocaleString()}
              </Text>
            </View>
            <Text style={{ color: colors.danger, fontWeight: '900' }}>-{h.amountCoins}</Text>
          </View>
        ))
      )}
    </Screen>
    <WithdrawPremiumModal
      state={modal}
      onClose={() => setModal({ visible: false })}
      onConfirm={() => {
        setModal({ visible: false });
        if (modal.visible && modal.mode === 'otp') {
          void submit();
        }
      }}
      onViewHistory={() => setModal({ visible: false })}
    />
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '900', marginTop: 10 },
  sub: { marginTop: 6, marginBottom: 16 },
  hero: {
    borderRadius: radii.xl,
    padding: 22,
    alignItems: 'center',
    marginBottom: 14,
  },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 48, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.8)' },
  gates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  gate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    minHeight: 52,
  },
  submit: { borderRadius: radii.lg, overflow: 'hidden', marginTop: 4 },
  submitGrad: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 10 },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  section: { fontWeight: '900', fontSize: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
});
