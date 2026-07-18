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
  const { signUp, usingFirebase } = useAuth();
  const { colors } = useTheme();
  const [method, setMethod] = useState<AuthMethod>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [isAgeVerified, setIsAgeVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setError(null);
    setLoading(true);
    try {
      await signUp({
        method,
        name,
        email,
        password,
        phone,
        isAgeVerified,
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
            </>
          )}
        </View>

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

        {error ? <Text style={{ color: colors.danger, marginTop: 12 }}>{error}</Text> : null}

        <PrimaryButton
          label="Create host account"
          onPress={handleSignup}
          loading={loading}
          style={{ marginTop: 22 }}
        />

        <Pressable
          onPress={() => navigation.navigate('Login')}
          style={styles.footer}
          accessibilityRole="link"
        >
          <Text style={{ color: colors.textSecondary }}>
            Already have an account?{' '}
            <Text style={{ color: colors.primarySoft, fontWeight: '800' }}>Log in</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { ...typography.hero, marginTop: 8 },
  subtitle: { marginTop: 8, marginBottom: 10, lineHeight: 22 },
  mode: { fontWeight: '700', fontSize: 12, marginBottom: 18 },
  form: { marginTop: 18, gap: 8 },
  label: { fontWeight: '700', marginTop: 8, fontSize: 13 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 22,
    minHeight: 44,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxLabel: { flex: 1, lineHeight: 20, fontSize: 14 },
  footer: { marginTop: 22, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
