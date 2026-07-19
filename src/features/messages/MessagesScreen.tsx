import {
  Headphones,
  MessageCircle,
  Megaphone,
  Shield,
  Sparkles,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  BodyText,
  DisplayText,
  GlassPanel,
  GradientCTA,
  PremiumShell,
  SectionLabel,
  SoftPress,
} from '../../components/premium/PremiumChrome';
import { useApp } from '../../context/AppContext';
import { useLiveStudio } from '../../context/LiveStudioContext';
import {
  fetchActiveUsers,
  fetchRechargeBoard,
  type RechargeUserRow,
} from '../../services/hostOutreachService';
import { ADMIN_SUPPORT_ID } from '../../services/chatService';
import { premium } from '../../theme/premium';
import { notify } from '../../utils/notify';

type InboxRow = {
  id: string;
  title: string;
  body: string;
  kind: 'private' | 'support' | 'system';
  at: number;
};

export function MessagesScreen({ navigation }: { navigation: any }) {
  const { user } = useApp();
  const { massTextAllActive, contactAdminSupport } = useLiveStudio();
  const [compose, setCompose] = useState('');
  const [supportNote, setSupportNote] = useState('');
  const [recharges, setRecharges] = useState<RechargeUserRow[]>([]);
  const [fans, setFans] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [board, users] = await Promise.all([
          fetchRechargeBoard(),
          fetchActiveUsers(),
        ]);
        if (dead) return;
        setRecharges((board.users || []).slice(0, 12));
        setFans(
          users
            .filter((u) => u.role === 'user')
            .slice(0, 12)
            .map((u) => ({ id: u.userId, name: u.userName })),
        );
      } catch {
        /* keep empty */
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const systemRows: InboxRow[] = recharges.map((r) => ({
    id: `sys_${r.userId}_${r.lastAt}`,
    title: 'System · Recharge',
    body: `ID ${r.userId} · ${r.lastCoins || r.totalCoins} coins`,
    kind: 'system',
    at: r.lastAt,
  }));

  const privateRows: InboxRow[] = fans.map((f, i) => ({
    id: f.id,
    title: f.name,
    body: i === 0 ? 'Tap to open private chat' : 'Fan conversation',
    kind: 'private',
    at: Date.now() - i * 60_000,
  }));

  const supportRow: InboxRow = {
    id: ADMIN_SUPPORT_ID,
    title: 'Host Support',
    body: 'Admin · tickets & help',
    kind: 'support',
    at: Date.now(),
  };

  const sendMass = async () => {
    const text = compose.trim();
    if (!text) {
      notify('Message', 'Write something first');
      return;
    }
    const n = await massTextAllActive(text);
    setCompose('');
    notify('Mass text sent', `${n} users reached`);
  };

  const sendSupport = async () => {
    const text = supportNote.trim();
    if (!text) return;
    await contactAdminSupport(text);
    setSupportNote('');
    notify('Support', 'Ticket sent to admin');
  };

  return (
    <PremiumShell padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BodyText mute style={styles.eyebrow}>
            INBOX
          </BodyText>
          <DisplayText size={30}>Messages</DisplayText>
          <BodyText soft style={{ marginTop: 4 }}>
            Private chat · host support · system alerts
          </BodyText>
        </View>

        <View style={{ paddingHorizontal: 18 }}>
          <GlassPanel pad={16} style={{ marginBottom: 14 }}>
            <View style={styles.rowIcon}>
              <Megaphone size={18} color={premium.rose} />
              <BodyText style={{ fontWeight: '800' }}>Mass text</BodyText>
            </View>
            <TextInput
              value={compose}
              onChangeText={setCompose}
              placeholder="Message all active fans…"
              placeholderTextColor={premium.textMute}
              style={styles.input}
              multiline
            />
            <GradientCTA label="Send to active users" onPress={() => void sendMass()} />
          </GlassPanel>

          <SectionLabel title="Host support" />
          <SoftPress
            onPress={() => navigation.navigate('DirectChat', { peerId: ADMIN_SUPPORT_ID, peerName: 'Admin' })}
          >
            <GlassPanel pad={14} style={{ marginBottom: 10 }}>
              <View style={styles.inboxRow}>
                <View style={[styles.iconBubble, { backgroundColor: 'rgba(45,212,191,0.16)' }]}>
                  <Headphones size={18} color={premium.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <BodyText style={{ fontWeight: '800' }}>{supportRow.title}</BodyText>
                  <BodyText mute style={{ fontSize: 12 }}>
                    {supportRow.body}
                  </BodyText>
                </View>
                <Shield size={16} color={premium.gold} />
              </View>
            </GlassPanel>
          </SoftPress>
          <GlassPanel pad={14} style={{ marginBottom: 8 }}>
            <TextInput
              value={supportNote}
              onChangeText={setSupportNote}
              placeholder="Quick note to admin…"
              placeholderTextColor={premium.textMute}
              style={styles.input}
            />
            <GradientCTA
              label="Send support ticket"
              tone="teal"
              onPress={() => void sendSupport()}
            />
          </GlassPanel>

          <SectionLabel title="Private chat" />
          {privateRows.length === 0 ? (
            <GlassPanel style={{ marginBottom: 10 }}>
              <BodyText soft>Fans appear when they message or recharge.</BodyText>
            </GlassPanel>
          ) : (
            privateRows.map((row) => (
              <SoftPress
                key={row.id}
                onPress={() =>
                  navigation.navigate('DirectChat', {
                    peerId: row.id,
                    peerName: row.title,
                  })
                }
              >
                <GlassPanel pad={14} style={{ marginBottom: 10 }}>
                  <View style={styles.inboxRow}>
                    <View style={[styles.iconBubble, { backgroundColor: 'rgba(255,77,109,0.14)' }]}>
                      <MessageCircle size={18} color={premium.rose} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <BodyText style={{ fontWeight: '800' }}>{row.title}</BodyText>
                      <BodyText mute style={{ fontSize: 12 }} numberOfLines={1}>
                        {row.body}
                      </BodyText>
                    </View>
                  </View>
                </GlassPanel>
              </SoftPress>
            ))
          )}

          <SectionLabel title="System messages" />
          {systemRows.length === 0 ? (
            <GlassPanel>
              <View style={styles.rowIcon}>
                <Sparkles size={16} color={premium.gold} />
                <BodyText soft>Recharge alerts show here in real time.</BodyText>
              </View>
            </GlassPanel>
          ) : (
            systemRows.map((row) => (
              <GlassPanel key={row.id} pad={14} style={{ marginBottom: 10 }}>
                <View style={styles.inboxRow}>
                  <View style={[styles.iconBubble, { backgroundColor: 'rgba(232,196,124,0.16)' }]}>
                    <Sparkles size={18} color={premium.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <BodyText style={{ fontWeight: '800' }}>{row.title}</BodyText>
                    <BodyText mute style={{ fontSize: 12 }}>
                      {row.body}
                    </BodyText>
                  </View>
                </View>
              </GlassPanel>
            ))
          )}

          <BodyText mute style={{ textAlign: 'center', marginTop: 8, marginBottom: 20 }}>
            Signed in as {user.name}
          </BodyText>
        </View>
      </ScrollView>
    </PremiumShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  header: { paddingHorizontal: 18, marginBottom: 16 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: premium.rose,
    marginBottom: 4,
  },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  input: {
    minHeight: 48,
    borderRadius: premium.radius.md,
    borderWidth: 1,
    borderColor: premium.line,
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: premium.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontWeight: '600',
  },
  inboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
