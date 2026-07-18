import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import type { HostWorkspaceMode } from '../types/hostWorkspace';
import { colors } from '../theme/colors';

const MODES: { key: HostWorkspaceMode; label: string }[] = [
  { key: 'waiting_1v1', label: '1v1 Wait' },
  { key: 'pk_battle', label: 'PK Arena' },
  { key: 'party_room', label: 'Party Room' },
  { key: 'solo_calling', label: 'On Call' },
];

export function HostWorkspaceSwitcher() {
  const {
    workspaceMode,
    setWorkspaceMode,
    enterPkBattle,
    enterPartyRoom,
    leavePkBattle,
    hostPresenceStatus,
    call,
  } = useApp();

  const onSelect = (mode: HostWorkspaceMode) => {
    if (mode === 'solo_calling' && !call) {
      return;
    }
    if (mode === 'pk_battle') {
      enterPkBattle();
    }
    if (mode === 'party_room') {
      enterPartyRoom();
    }
    if (mode === 'waiting_1v1') {
      leavePkBattle();
    }
    setWorkspaceMode(mode);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>HOST STATUS</Text>
        <LinearGradient
          colors={['rgba(255,42,122,0.3)', 'rgba(255,184,0,0.2)']}
          style={styles.statusPill}
        >
          <View style={styles.statusDot} />
          <Text style={styles.statusValue}>
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
                active && styles.chipOn,
                disabled && styles.chipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  active && styles.chipTextOn,
                  disabled && styles.chipTextDisabled,
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
  statusLabel: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,42,122,0.45)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  statusValue: { color: colors.text, fontWeight: '800', fontSize: 11 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#151026',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipOn: {
    backgroundColor: 'rgba(255,42,122,0.25)',
    borderColor: colors.primary,
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  chipDisabled: { opacity: 0.4 },
  chipText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 12,
  },
  chipTextOn: { color: '#fff' },
  chipTextDisabled: { color: colors.textMuted },
});
