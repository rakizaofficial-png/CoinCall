import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user?.name}</Text>

        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{user?.role}</Text>

        {user?.email ? (
          <>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user.email}</Text>
          </>
        ) : null}

        {user?.phone ? (
          <>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{user.phone}</Text>
          </>
        ) : null}
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
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
  card: {
    marginTop: 24,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 4,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  value: {
    fontSize: 17,
    color: colors.text,
    fontWeight: '600',
  },
  signOutButton: {
    marginTop: 28,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  signOutText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 16,
  },
});
