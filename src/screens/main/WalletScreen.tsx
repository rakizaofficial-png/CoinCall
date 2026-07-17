import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export function WalletScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wallet</Text>
      <Text style={styles.balanceLabel}>Coin balance</Text>
      <Text style={styles.balance}>{user?.coinBalance ?? 0}</Text>
      <Text style={styles.body}>
        Coin packages and transaction history come in later steps. Showing mock balance for now.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  balanceLabel: {
    marginTop: 24,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  balance: {
    marginTop: 4,
    fontSize: 40,
    fontWeight: '700',
    color: colors.accent,
  },
  body: {
    marginTop: 16,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
  },
});
