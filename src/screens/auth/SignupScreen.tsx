import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import type { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;
type AuthMethod = 'email' | 'phone';

export function SignupScreen({ navigation }: Props) {
  const { signUp, usingFirebase } = useAuth();
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Join as Beauty Host</Text>
        <Text style={styles.subtitle}>
          Create account → submit photo & video → wait for Host ID approval
        </Text>
        <Text style={styles.mode}>
          {usingFirebase ? 'Real Firebase signup ON' : 'Demo mode'}
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

        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />

          {method === 'email' ? (
            <>
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
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                placeholder="+92 300 1234567"
                placeholderTextColor={colors.textMuted}
                value={phone}
                onChangeText={setPhone}
              />
            </>
          )}
        </View>

        <Pressable
          style={styles.checkboxRow}
          onPress={() => setIsAgeVerified((prev) => !prev)}
        >
          <View style={[styles.checkbox, isAgeVerified && styles.checkboxChecked]}>
            {isAgeVerified ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.checkboxLabel}>
            I confirm that I am 18 years of age or older
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Join as Host</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={styles.footerLink}>
          <Text style={styles.footerText}>
            Already have an account? <Text style={styles.footerTextBold}>Log in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  brand: { fontSize: 36, fontWeight: '800', color: colors.text },
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 24,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
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
  footerLink: { marginTop: 24, alignItems: 'center' },
  footerText: { color: colors.textSecondary, fontSize: 15 },
  footerTextBold: { color: colors.primarySoft, fontWeight: '800' },
});
