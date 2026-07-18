import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, Plus, Users } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

const SEAT_COUNT = 6;

export function PartyRoomHub() {
  const { colors } = useTheme();
  const {
    user,
    partySeats,
    joinPartySeat,
    leavePartySeat,
    partyGroupGiftsToday,
    partyLiveSeconds,
    setWorkspaceMode,
    hosts,
  } = useApp();

  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => p + 1), 900);
    return () => clearInterval(t);
  }, []);

  const occupied = useMemo(
    () => partySeats.filter((s) => s.occupied).length,
    [partySeats],
  );

  const mm = String(Math.floor(partyLiveSeconds / 60)).padStart(2, '0');
  const ss = String(partyLiveSeconds % 60).padStart(2, '0');

  const seats = useMemo(() => {
    const filled = [...partySeats];
    while (filled.length < SEAT_COUNT) {
      filled.push({
        index: filled.length,
        occupied: false,
        hostId: null,
        name: '',
        avatarUrl: '',
        isMe: false,
        isSpeaking: false,
        micOn: false,
      });
    }
    return filled.slice(0, SEAT_COUNT);
  }, [partySeats]);

  return (
    <LinearGradient colors={['#0b0813', '#151026', '#1a1230']} style={styles.root}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>MULTI-HOST WORKSPACE</Text>
          <Text style={styles.title}>Group Party Room</Text>
        </View>
        <Pressable
          style={styles.exitBtn}
          onPress={() => setWorkspaceMode('waiting_1v1')}
        >
          <LogOut size={18} color={colors.text} />
          <Text style={[styles.exitText, { color: colors.text }]}>Exit</Text>
        </Pressable>
      </View>

      <LinearGradient
        colors={['rgba(255,184,0,0.22)', 'rgba(255,42,122,0.12)']}
        style={styles.giftTicker}
      >
        <Text style={styles.giftLabel}>Total Group Gifts Received Today</Text>
        <Text style={styles.giftValue}>
          🎁 {partyGroupGiftsToday.toLocaleString()}
        </Text>
        <Text style={styles.giftSub}>
          {occupied}/{SEAT_COUNT} seats live · room clock {mm}:{ss}
        </Text>
      </LinearGradient>

      <Text style={styles.gridLabel}>Active multi-grid seats · tap empty to join</Text>

      <View style={styles.grid}>
        {seats.map((seat) => {
          const speakingGlow =
            seat.occupied && seat.isSpeaking && pulse % 2 === 0;
          return (
            <Pressable
              key={seat.index}
              style={[
                styles.seat,
                seat.occupied ? styles.seatFilled : styles.seatEmpty,
                speakingGlow && styles.seatSpeaking,
              ]}
              onPress={() => {
                if (seat.occupied && seat.isMe) {
                  leavePartySeat();
                  return;
                }
                if (!seat.occupied) {
                  joinPartySeat(seat.index);
                }
              }}
            >
              {seat.occupied ? (
                <>
                  <Image
                    source={{ uri: seat.avatarUrl }}
                    style={styles.seatAvatar}
                  />
                  {seat.isMe ? (
                    <View style={styles.meBadge}>
                      <Text style={styles.meBadgeText}>YOU</Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.micDot,
                      {
                        backgroundColor: seat.micOn
                          ? colors.online
                          : colors.textMuted,
                      },
                    ]}
                  />
                  <Text style={styles.seatName} numberOfLines={1}>
                    {seat.name}
                  </Text>
                  <Text style={styles.seatHint}>
                    {seat.isSpeaking ? 'Speaking…' : 'In stream'}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.emptyOrb}>
                    <Plus size={28} color={colors.accent} />
                  </View>
                  <Text style={styles.seatName}>Seat {seat.index + 1}</Text>
                  <Text style={styles.seatHint}>Tap to join</Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footerActions}>
        <Pressable
          style={styles.primaryAction}
          onPress={() => {
            const empty = seats.find((s) => !s.occupied);
            if (empty) joinPartySeat(empty.index);
          }}
        >
          <LinearGradient
            colors={[colors.primary, '#c41858']}
            style={styles.primaryGrad}
          >
            <Users size={18} color="#fff" />
            <Text style={styles.primaryText}>Join Active Group Stream</Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.footerNote}>
          Idle hosts auto-park here when no 1v1 call is pending · {user.name}
        </Text>
        <Text style={styles.footerPeers}>
          Nearby online: {hosts.filter((h) => h.isOnline).slice(0, 3).map((h) => h.name.split(' ')[0]).join(' · ') || '—'}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,42,122,0.35)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    marginBottom: 14,
  },
  headerRow: {
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
  title: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 22,
    marginTop: 2,
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.35)',
  },
  exitText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  giftTicker: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.55)',
    shadowColor: '#ffb800',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  giftLabel: {
    color: 'rgba(255,220,150,0.95)',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  giftValue: {
    color: colors.cyberGold,
    fontWeight: '900',
    fontSize: 28,
    marginTop: 4,
    textShadowColor: 'rgba(255,184,0,0.65)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  giftSub: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  gridLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  seat: {
    width: '31%',
    flexGrow: 1,
    minWidth: '30%',
    maxWidth: '32%',
    aspectRatio: 0.82,
    borderRadius: 18,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  seatFilled: {
    backgroundColor: '#1a1428',
    borderColor: 'rgba(255,42,122,0.55)',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  seatEmpty: {
    backgroundColor: '#12101c',
    borderColor: 'rgba(255,184,0,0.35)',
    borderStyle: 'dashed',
    shadowColor: '#ffb800',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  seatSpeaking: {
    borderColor: colors.online,
    shadowColor: colors.online,
    shadowOpacity: 0.7,
  },
  seatAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  meBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  meBadgeText: { color: '#1a1020', fontWeight: '900', fontSize: 8 },
  micDot: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyOrb: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: 'rgba(255,184,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,184,0,0.08)',
  },
  seatName: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  seatHint: {
    color: colors.textMuted,
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  footerActions: { marginTop: 16 },
  primaryAction: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#ff2a7a',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  primaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  footerNote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
  footerPeers: {
    color: colors.primarySoft,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '700',
  },
});
