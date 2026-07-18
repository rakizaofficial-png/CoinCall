import { LinearGradient } from 'expo-linear-gradient';
import { Phone, Users, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

export function Waiting1v1Panel() {
  const { colors } = useTheme();
  const {
    hostOnline,
    setHostOnline,
    hostPresenceStatus,
    setWorkspaceMode,
    enterPkBattle,
    enterPartyRoom,
    incomingBridgeCall,
    callsToday,
    myTodayMinutes,
  } = useApp();

  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => p + 1), 800);
    return () => clearInterval(t);
  }, []);

  const ringScale = pulse % 2 === 0 ? 1 : 1.06;

  return (
    <LinearGradient
      colors={[colors.bg, colors.bgElevated, colors.bgSoft]}
      style={[styles.root, { borderColor: `${colors.accent}55` }]}
    >
      <Text style={[styles.eyebrow, { color: colors.accent }]}>1V1 WAITING SCREEN</Text>
      <Text style={[styles.title, { color: colors.text }]}>Ready for private calls</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Presence: {hostPresenceStatus.replace('_', ' ').toUpperCase()} ·{' '}
        {callsToday} calls · {myTodayMinutes}m today
      </Text>

      <Pressable
        onPress={() => setHostOnline(!hostOnline)}
        style={[styles.orbWrap, { transform: [{ scale: hostOnline ? ringScale : 1 }] }]}
      >
        <LinearGradient
          colors={
            hostOnline
              ? ['rgba(61,214,140,0.35)', 'rgba(11,8,19,0.9)']
              : ['rgba(255,42,122,0.35)', 'rgba(11,8,19,0.9)']
          }
          style={[
            styles.orb,
            hostOnline ? styles.orbOn : styles.orbOff,
          ]}
        >
          <View
            style={[
              styles.orbInner,
              {
                borderColor: hostOnline ? colors.online : colors.danger,
              },
            ]}
          >
            <Text style={styles.orbTitle}>
              {hostOnline ? 'ONLINE · WAITING' : 'OFFLINE'}
            </Text>
            <Text style={styles.orbSub}>
              {hostOnline
                ? 'Listening for Luma 1v1 incoming…'
                : 'Tap to go live and earn'}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>

      {incomingBridgeCall ? (
        <LinearGradient
          colors={['rgba(255,42,122,0.35)', 'rgba(255,184,0,0.15)']}
          style={styles.incomingBanner}
        >
          <Phone size={18} color={colors.accent} />
          <Text style={[styles.incomingText, { color: colors.text }]}>
            Incoming 1v1 from {incomingBridgeCall.userName} — Attend popup open
          </Text>
        </LinearGradient>
      ) : (
        <Text style={[styles.idleHint, { color: colors.textMuted }]}>
          No 1v1 pending — jump into Party Room or PK to stay engaged
        </Text>
      )}

      <View style={styles.quickRow}>
        <Pressable
          style={styles.quickCard}
          onPress={() => {
            enterPkBattle();
            setWorkspaceMode('pk_battle');
          }}
        >
          <LinearGradient
            colors={[`${colors.primary}40`, colors.bgElevated]}
            style={styles.quickGrad}
          >
            <Zap size={22} color={colors.primary} />
            <Text style={[styles.quickTitle, { color: colors.text }]}>PK Battle</Text>
            <Text style={[styles.quickSub, { color: colors.textSecondary }]}>
              Split-screen duel
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={styles.quickCard}
          onPress={() => {
            enterPartyRoom();
            setWorkspaceMode('party_room');
          }}
        >
          <LinearGradient
            colors={[`${colors.accent}38`, colors.bgElevated]}
            style={styles.quickGrad}
          >
            <Users size={22} color={colors.accent} />
            <Text style={[styles.quickTitle, { color: colors.text }]}>Party Room</Text>
            <Text style={[styles.quickSub, { color: colors.textSecondary }]}>
              4–6 host seats
            </Text>
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
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    marginBottom: 14,
  },
  eyebrow: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: {
    fontWeight: '900',
    fontSize: 22,
    marginTop: 4,
  },
  sub: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 16,
  },
  orbWrap: { alignItems: 'center', marginBottom: 14 },
  orb: {
    width: '100%',
    borderRadius: 28,
    padding: 6,
  },
  orbOn: {
    shadowOpacity: 0.65,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  orbOff: {
    shadowOpacity: 0.45,
    shadowRadius: 14,
  },
  orbInner: {
    borderWidth: 3,
    borderRadius: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  orbTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
  orbSub: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
    fontSize: 12,
  },
  incomingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(108,124,255,0.45)',
  },
  incomingText: {
    flex: 1,
    fontWeight: '700',
    fontSize: 12,
  },
  idleHint: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
  },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickCard: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(108,124,255,0.35)',
  },
  quickGrad: {
    padding: 14,
    minHeight: 110,
    justifyContent: 'center',
  },
  quickTitle: {
    fontWeight: '900',
    fontSize: 15,
    marginTop: 8,
  },
  quickSub: { fontSize: 11, marginTop: 2 },
});
