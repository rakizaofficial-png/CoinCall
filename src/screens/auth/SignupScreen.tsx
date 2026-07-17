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
  const { signUp } = useAuth();
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signup failed.');
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
        <View style={styles.header}>
          <Text style={styles.brand}>CoinCall</Text>
          <Text style={styles.subtitle}>Create your account</Text>
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

        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
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
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textSecondary}
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
                placeholderTextColor={colors.textSecondary}
                value={phone}
                onChangeText={setPhone}
              />
              <Text style={styles.hint}>
                Mock signup — no real OTP yet. Phone is stored locally only.
              </Text>
            </>
          )}
        </View>

        <Pressable
          style={styles.checkboxRow}
          onPress={() => setIsAgeVerified((prev) => !prev)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAgeVerified }}
        >
          <View style={[styles.checkbox, isAgeVerified && styles.checkboxChecked]}>
            {isAgeVerified ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.checkboxLabel}>I confirm that I am 18 years of age or older</Text>
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
            <Text style={styles.primaryButtonText}>Sign Up</Text>
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
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
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
