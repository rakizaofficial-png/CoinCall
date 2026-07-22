import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Mail, Phone } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTextInput, SegmentedControl } from '../../components/ui/AppTextInput';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { Screen } from '../../components/ui/Screen';
import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';
import { radii, typography } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;
type AuthMethod = 'email' | 'phone';

export function LoginScreen({ navigation }: Props) {
  const { signIn, usingFirebase, sendLoginOtp, sendPasswordReset } = useAuth();
  const { colors } = useTheme();
  const [method, setMethod] = useState<AuthMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    setError(null);
    if (!phone.trim()) {
      setError('Enter a phone number first.');
      return;
    }
    setLoading(true);
    try {
      await sendLoginOtp(phone.trim());
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your account email first.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setInfo('Password reset email sent. Check your inbox.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    setInfo(null);
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
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={[styles.brand, { color: colors.text }]}>CoinCall</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Premium host studio · sign in to continue
        </Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: `${colors.primary}22`, borderColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.primarySoft, fontWeight: '700', fontSize: 12 }}>
            {usingFirebase ? 'Secure cloud login' : 'Demo mode'}
          </Text>
        </View>

        <SegmentedControl
          value={method}
          onChange={(m) => {
            setMethod(m);
            setError(null);
          }}
          options={[
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone OTP' },
          ]}
        />

        <View style={styles.form}>
          {method === 'email' ? (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputIcon}>
                  <Mail size={18} color={colors.textMuted} />
                </View>
                <AppTextInput
                  style={styles.inputFlex}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                />
              </View>
              <Text style={[styles.label, { color: colors.text }]}>Password</Text>
              <AppTextInput
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Phone</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputIcon}>
                  <Phone size={18} color={colors.textMuted} />
                </View>
                <AppTextInput
                  style={styles.inputFlex}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+971…"
                />
              </View>
              {otpSent ? (
                <>
                  <Text style={[styles.label, { color: colors.text }]}>OTP</Text>
                  <AppTextInput
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="6-digit code"
                  />
                </>
              ) : null}
            </>
          )}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
        {info ? <Text style={[styles.error, { color: colors.primary }]}>{info}</Text> : null}

        {method === 'phone' && !otpSent ? (
          <PrimaryButton label="Send OTP" onPress={handleSendOtp} style={{ marginTop: 20 }} />
        ) : (
          <PrimaryButton
            label="Sign in"
            onPress={handleLogin}
            loading={loading}
            style={{ marginTop: 20 }}
          />
        )}

        {method === 'email' ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleForgotPassword}
            style={{ marginTop: 12, alignItems: 'center' }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Forgot password?</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="link"
          onPress={() => navigation.navigate('Signup')}
          style={styles.footer}
        >
          <Text style={{ color: colors.textSecondary }}>
            New host?{' '}
            <Text style={{ color: colors.primarySoft, fontWeight: '800' }}>Create account</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { ...typography.hero, marginTop: 12 },
  subtitle: { marginTop: 8, marginBottom: 16, ...typography.subtitle },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    marginBottom: 20,
  },
  form: { marginTop: 18, gap: 8 },
  label: { ...typography.label, marginTop: 8 },
  inputRow: { position: 'relative', justifyContent: 'center' },
  inputIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 2,
    height: 52,
    justifyContent: 'center',
  },
  inputFlex: { paddingLeft: 42 },
  error: { marginTop: 14, fontWeight: '600' },
  footer: { marginTop: 24, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
