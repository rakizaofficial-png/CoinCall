import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';

export function PkBattleArena() {
  const { pkBattle, tickPkBattle, setWorkspaceMode, leavePkBattle } = useApp();

  useEffect(() => {
    if (!pkBattle?.active) return;
    const t = setInterval(() => tickPkBattle(), 1000);
    return () => clearInterval(t);
  }, [pkBattle?.active, tickPkBattle]);

  if (!pkBattle || !pkBattle.active) {
    return (
      <LinearGradient colors={['#0b0813', '#151026']} style={styles.emptyRoot}>
        <Text style={styles.emptyTitle}>No active PK Battle</Text>
        <Text style={styles.emptySub}>
          Start a match from the Host HQ switcher to open the split-screen arena.
        </Text>
        <Pressable
          style={styles.backBtn}
          onPress={() => setWorkspaceMode('waiting_1v1')}
        >
          <Text style={styles.backText}>Back to 1v1 Waiting</Text>
        </Pressable>
      </LinearGradient>
    );
  }

  const total = Math.max(1, pkBattle.pinkPoints + pkBattle.bluePoints);
  const pinkPct = Math.round((pkBattle.pinkPoints / total) * 100);
  const bluePct = 100 - pinkPct;
  const mm = String(Math.floor(pkBattle.secondsLeft / 60)).padStart(2, '0');
  const ss = String(pkBattle.secondsLeft % 60).padStart(2, '0');
  const leading =
    pkBattle.pinkPoints === pkBattle.bluePoints
      ? 'Tied'
      : pkBattle.pinkPoints > pkBattle.bluePoints
        ? 'Pink leading'
        : 'Blue leading';

  return (
    <LinearGradient colors={['#0b0813', '#151026', '#1a0f28']} style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>HOST VS HOST</Text>
          <Text style={styles.title}>PK Battle Arena</Text>
        </View>
        <View style={styles.timerChip}>
          <Ionicons name="timer-outline" size={14} color={colors.accent} />
          <Text style={styles.timerText}>
            {mm}:{ss}
          </Text>
        </View>
      </View>

      {/* Horizontal battle progress — Pink vs Blue */}
      <View style={styles.progressWrap}>
        <View style={styles.progressLabels}>
          <Text style={styles.pinkLabel}>
            PINK · {pkBattle.pinkPoints.toLocaleString()}
          </Text>
          <Text style={styles.vsMid}>{leading}</Text>
          <Text style={styles.blueLabel}>
            {pkBattle.bluePoints.toLocaleString()} · BLUE
          </Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barPink, { flex: Math.max(pinkPct, 8) }]} />
          <View style={styles.barDivider} />
          <View style={[styles.barBlue, { flex: Math.max(bluePct, 8) }]} />
        </View>
        <View style={styles.pctRow}>
          <Text style={styles.pctPink}>{pinkPct}%</Text>
          <Text style={styles.pctBlue}>{bluePct}%</Text>
        </View>
      </View>

      {/* Split-screen viewport */}
      <View style={styles.split}>
        <LinearGradient
          colors={['#3a0a22', '#1a0814']}
          style={[styles.pane, styles.panePink]}
        >
          <View style={styles.teamTagPink}>
            <Text style={styles.teamTagText}>PINK TEAM</Text>
          </View>
          <Image
            source={{ uri: pkBattle.pinkHost.avatarUrl }}
            style={styles.paneAvatar}
          />
          <Text style={styles.paneName}>{pkBattle.pinkHost.name}</Text>
          <Text style={styles.panePts}>
            {pkBattle.pinkPoints.toLocaleString()} pts
          </Text>
          {pkBattle.mySide === 'pink' ? (
            <View style={styles.youChip}>
              <Text style={styles.youChipText}>YOU</Text>
            </View>
          ) : null}
          <View style={styles.liveFake}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE FEED</Text>
          </View>
        </LinearGradient>

        <LinearGradient
          colors={['#0a1a3a', '#081018']}
          style={[styles.pane, styles.paneBlue]}
        >
          <View style={styles.teamTagBlue}>
            <Text style={styles.teamTagText}>BLUE TEAM</Text>
          </View>
          <Image
            source={{ uri: pkBattle.blueHost.avatarUrl }}
            style={styles.paneAvatar}
          />
          <Text style={styles.paneName}>{pkBattle.blueHost.name}</Text>
          <Text style={[styles.panePts, { color: '#6ec8ff' }]}>
            {pkBattle.bluePoints.toLocaleString()} pts
          </Text>
          {pkBattle.mySide === 'blue' ? (
            <View style={[styles.youChip, { backgroundColor: '#3d8fff' }]}>
              <Text style={styles.youChipText}>YOU</Text>
            </View>
          ) : null}
          <View style={styles.liveFake}>
            <View style={[styles.liveDot, { backgroundColor: '#3d8fff' }]} />
            <Text style={styles.liveText}>LIVE FEED</Text>
          </View>
        </LinearGradient>
      </View>

      <Text style={styles.engageNote}>
        Engagement points update every second from viewer votes & gifts · tick #
        {pkBattle.engagementTick}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => {
            leavePkBattle();
            setWorkspaceMode('waiting_1v1');
          }}
        >
          <Text style={styles.secondaryText}>Leave Battle</Text>
        </Pressable>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => setWorkspaceMode('party_room')}
        >
          <LinearGradient
            colors={[colors.primary, '#c41858']}
            style={styles.primaryGrad}
          >
            <Text style={styles.primaryText}>Open Party Room</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,42,122,0.4)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    marginBottom: 14,
  },
  emptyRoot: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.3)',
    marginBottom: 14,
  },
  emptyTitle: { color: colors.text, fontWeight: '900', fontSize: 18 },
  emptySub: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  backText: { color: '#fff', fontWeight: '800' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  eyebrow: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: { color: colors.text, fontWeight: '900', fontSize: 22, marginTop: 2 },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,184,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    shadowColor: '#ffb800',
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  timerText: { color: colors.accent, fontWeight: '900', fontSize: 14 },
  progressWrap: { marginBottom: 14 },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pinkLabel: { color: '#ff6aa8', fontWeight: '900', fontSize: 12 },
  blueLabel: { color: '#6ec8ff', fontWeight: '900', fontSize: 12 },
  vsMid: { color: colors.textSecondary, fontWeight: '700', fontSize: 11 },
  barTrack: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1424',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  barPink: {
    backgroundColor: '#ff2a7a',
    shadowColor: '#ff2a7a',
  },
  barBlue: {
    backgroundColor: '#3d8fff',
  },
  barDivider: {
    width: 3,
    backgroundColor: '#fff',
  },
  pctRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  pctPink: { color: '#ff6aa8', fontWeight: '800', fontSize: 11 },
  pctBlue: { color: '#6ec8ff', fontWeight: '800', fontSize: 11 },
  split: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 220,
  },
  pane: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 220,
  },
  panePink: {
    borderColor: 'rgba(255,42,122,0.65)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  paneBlue: {
    borderColor: 'rgba(61,143,255,0.65)',
    shadowColor: '#3d8fff',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  teamTagPink: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,42,122,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  teamTagBlue: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(61,143,255,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  teamTagText: { color: '#fff', fontWeight: '900', fontSize: 9 },
  paneAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  paneName: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    marginTop: 10,
    textAlign: 'center',
  },
  panePts: {
    color: colors.accent,
    fontWeight: '900',
    fontSize: 18,
    marginTop: 4,
  },
  youChip: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  youChipText: { color: '#1a1020', fontWeight: '900', fontSize: 10 },
  liveFake: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff2a7a',
  },
  liveText: { color: '#fff', fontWeight: '800', fontSize: 9 },
  engageNote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.45)',
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(255,184,0,0.08)',
  },
  secondaryText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  primaryBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  primaryGrad: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 13 },
});
