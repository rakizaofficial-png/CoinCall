import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import type { HostWorkspaceMode } from '../types/hostWorkspace';
import { radii } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

const MODES: { key: HostWorkspaceMode; label: string }[] = [
  { key: 'waiting_1v1', label: '1v1 Wait' },
  { key: 'solo_calling', label: 'On Call' },
];

export function HostWorkspaceSwitcher() {
  const { colors } = useTheme();
  const { workspaceMode, setWorkspaceMode, hostPresenceStatus, call } = useApp();

  const onSelect = (mode: HostWorkspaceMode) => {
    if (mode === 'solo_calling' && !call) return;
    setWorkspaceMode(mode);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.statusRow}>
        <Text style={[styles.statusLabel, { color: colors.accent }]}>HOST STATUS</Text>
        <LinearGradient
          colors={[`${colors.primary}4D`, `${colors.accent}33`]}
          style={[styles.statusPill, { borderColor: `${colors.primary}73` }]}
        >
          <View style={[styles.statusDot, { backgroundColor: colors.online }]} />
          <Text style={[styles.statusValue, { color: colors.text }]}>
            {hostPresenceStatus.replace('_', ' ').toUpperCase()}
          </Text>
        </LinearGradient>
      </View>
      <View style={styles.row}>
        {MODES.map((m) => {
          const active = workspaceMode === m.key;
          const disabled = m.key === 'solo_calling' && !call;
          return (
            <Pressable
              key={m.key}
              disabled={disabled}
              onPress={() => onSelect(m.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.border,
                },
                active && {
                  backgroundColor: `${colors.primary}33`,
                  borderColor: colors.primary,
                },
                disabled && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.textSecondary },
                  active && { color: colors.text },
                  disabled && { color: colors.textMuted },
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusLabel: { fontWeight: '800', fontSize: 10, letterSpacing: 1.1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusValue: { fontWeight: '800', fontSize: 11 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontWeight: '800', fontSize: 12 },
});
