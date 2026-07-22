import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
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

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;
type AuthMethod = 'email' | 'phone';

export function SignupScreen({ navigation }: Props) {
  const { signUp, signIn, sendLoginOtp, usingFirebase } = useAuth();
  const { colors } = useTheme();
  const [method, setMethod] = useState<AuthMethod>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [agencyCode, setAgencyCode] = useState('');
  const [isAgeVerified, setIsAgeVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setError(null);
    if (!isAgeVerified) {
      setError('You must confirm you are 18 or older.');
      return;
    }
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setLoading(true);
    try {
      if (method === 'phone') {
        if (!otpSent) {
          await sendLoginOtp(phone.trim());
          setOtpSent(true);
          return;
        }
        await signIn({ method: 'phone', phone: phone.trim(), otp: otp.trim() });
        return;
      }
      await signUp({
        method: 'email',
        name,
        email,
        password,
        phone,
        isAgeVerified,
        agencyCode: agencyCode.trim() || undefined,
      });
    } catch (e: any) {
      const code = e?.code as string | undefined;
      if (code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please log in.');
      } else if (code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email.');
      } else {
        setError(e instanceof Error ? e.message : 'Signup failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={[styles.brand, { color: colors.text }]}>Join CoinCall</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Create account → submit photos → get Host ID approval
        </Text>
        <Text style={[styles.mode, { color: colors.primarySoft }]}>
          {usingFirebase ? 'Secure cloud signup' : 'Demo mode'}
        </Text>

        <SegmentedControl
          value={method}
          onChange={(m) => {
            setMethod(m);
            setError(null);
            setOtpSent(false);
          }}
          options={[
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone' },
          ]}
        />

        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <AppTextInput value={name} onChangeText={setName} placeholder="Your host name" />

          {method === 'email' ? (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <AppTextInput
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
              />
              <Text style={[styles.label, { color: colors.text }]}>Password</Text>
              <AppTextInput
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
              />
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.text }]}>Phone</Text>
              <AppTextInput
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                placeholder="+971…"
              />
              {otpSent ? (
                <>
                  <Text style={[styles.label, { color: colors.text }]}>OTP code</Text>
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

        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Agency referral code{' '}
          <Text style={{ fontWeight: '400', fontSize: 12 }}>(optional)</Text>
        </Text>
        <AppTextInput
          autoCapitalize="characters"
          value={agencyCode}
          onChangeText={setAgencyCode}
          placeholder="e.g. AG-12345 · skip if none"
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAgeVerified }}
          style={styles.checkboxRow}
          onPress={() => setIsAgeVerified((prev) => !prev)}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: colors.border,
                backgroundColor: isAgeVerified ? colors.primary : colors.bgCard,
              },
            ]}
          >
            {isAgeVerified ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
          </View>
          <Text style={[styles.checkboxLabel, { color: colors.text }]}>
            I confirm that I am 18 years of age or older
          </Text>
        </Pressable>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <PrimaryButton
          label={
            loading
              ? 'Please wait…'
              : method === 'phone'
                ? otpSent
                  ? 'Verify & continue'
                  : 'Send OTP'
                : 'Create account'
          }
          onPress={handleSignup}
          loading={loading}
        />

        <Pressable onPress={() => navigation.navigate('Login')} style={styles.link}>
          <Text style={{ color: colors.textSecondary }}>
            Already have an account?{' '}
            <Text style={{ color: colors.primarySoft, fontWeight: '800' }}>Sign in</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { ...typography.hero, marginTop: 12 },
  subtitle: { marginTop: 8, marginBottom: 8, lineHeight: 22 },
  mode: { fontWeight: '700', marginBottom: 16 },
  form: { marginTop: 16, gap: 4 },
  label: { fontWeight: '700', marginTop: 10, marginBottom: 6 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: { flex: 1, fontWeight: '600' },
  error: { marginTop: 12, fontWeight: '600' },
  link: { marginTop: 18, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
