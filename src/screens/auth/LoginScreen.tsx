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
  const { signIn, usingFirebase } = useAuth();
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
    } catch (e: any) {
      const code = e?.code as string | undefined;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Wrong email or password.');
      } else if (code === 'auth/user-not-found') {
        setError('No account found. Please sign up first.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many tries. Wait a minute and try again.');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check internet and try again.');
      } else {
        setError(e instanceof Error ? e.message : 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
        <Text style={styles.brand}>CoinCall Beauty</Text>
      <Text style={styles.subtitle}>Host login · earn with your smile</Text>
      <Text style={styles.mode}>
        {usingFirebase ? 'Real Firebase login ON' : 'Demo mode'}
      </Text>

      <View style={styles.methodRow}>
        {(['email', 'phone'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.methodChip, method === m && styles.methodChipActive]}
            onPress={() => {
              setMethod(m);
              setError(null);
            }}
          >
            <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
              {m === 'email' ? 'Email' : 'Phone OTP'}
            </Text>
          </Pressable>
        ))}
      </View>

      {method === 'email' ? (
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="Your password"
            placeholderTextColor={colors.textMuted}
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
            placeholderTextColor={colors.textMuted}
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
                placeholderTextColor={colors.textMuted}
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
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  brand: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  mode: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 20,
  },
  methodRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  methodChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodText: { color: colors.textSecondary, fontWeight: '700' },
  methodTextActive: { color: colors.text },
  form: { gap: 8 },
  label: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  hint: { marginTop: 8, color: colors.textSecondary, fontSize: 13 },
  error: { marginTop: 16, color: colors.danger, fontSize: 14 },
  primaryButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: { color: colors.primary, fontWeight: '800' },
  footerLink: { marginTop: 24, alignItems: 'center' },
  footerText: { color: colors.textSecondary, fontSize: 15 },
  footerTextBold: { color: colors.primarySoft, fontWeight: '800' },
});
