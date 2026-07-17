import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;
type AuthMethod = 'email' | 'phone';

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [method, setMethod] = useState<AuthMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = () => {
    setError(null);
    if (!phone.trim()) {
      setError('Enter a phone number first.');
      return;
    }
    setOtpSent(true);
  };

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(
        method === 'email'
          ? { method: 'email', email, password }
          : { method: 'phone', phone, otp },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>CoinCall</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.methodRow}>
        <Pressable
          style={[styles.methodChip, method === 'email' && styles.methodChipActive]}
          onPress={() => {
            setMethod('email');
            setError(null);
          }}
        >
          <Text style={[styles.methodText, method === 'email' && styles.methodTextActive]}>
            Email
          </Text>
        </Pressable>
        <Pressable
          style={[styles.methodChip, method === 'phone' && styles.methodChipActive]}
          onPress={() => {
            setMethod('phone');
            setError(null);
          }}
        >
          <Text style={[styles.methodText, method === 'phone' && styles.methodTextActive]}>
            Phone OTP
          </Text>
        </Pressable>
      </View>

      {method === 'email' ? (
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="Your password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            placeholder="+92 300 1234567"
            placeholderTextColor={colors.textSecondary}
            value={phone}
            onChangeText={setPhone}
          />
          {!otpSent ? (
            <Pressable style={styles.secondaryButton} onPress={handleSendOtp}>
              <Text style={styles.secondaryButtonText}>Send OTP</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.hint}>Mock OTP sent. Enter any 4+ digits.</Text>
              <Text style={styles.label}>OTP</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                placeholder="1234"
                placeholderTextColor={colors.textSecondary}
                value={otp}
                onChangeText={setOtp}
              />
            </>
          )}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading || (method === 'phone' && !otpSent)}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Log In</Text>
        )}
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Signup')} style={styles.footerLink}>
        <Text style={styles.footerText}>
          New here? <Text style={styles.footerTextBold}>Create an account</Text>
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  header: {
    marginBottom: 28,
  },
  brand: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.textSecondary,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  methodChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  methodText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  methodTextActive: {
    color: colors.primary,
  },
  form: {
    gap: 8,
  },
  label: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  hint: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 13,
  },
  error: {
    marginTop: 16,
    color: colors.danger,
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '700',
  },
  footerLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  footerTextBold: {
    color: colors.primary,
    fontWeight: '700',
  },
});
