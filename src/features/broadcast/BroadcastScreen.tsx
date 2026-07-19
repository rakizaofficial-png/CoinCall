import { Calendar, Megaphone, Rocket, Sparkles } from 'lucide-react-native';
import { useMemo, useState } from 'react';
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
import { useLiveStudio } from '../../context/LiveStudioContext';
import { premium } from '../../theme/premium';
import { notify } from '../../utils/notify';

type Campaign = {
  id: string;
  title: string;
  body: string;
  kind: 'announcement' | 'event' | 'campaign';
  status: 'draft' | 'live' | 'scheduled';
};

const SEED: Campaign[] = [
  {
    id: 'a1',
    title: 'Weekend gift boost',
    body: 'Double gift XP for fans who recharge tonight.',
    kind: 'campaign',
    status: 'live',
  },
  {
    id: 'e1',
    title: 'Friday Party Night',
    body: 'Open Party Room 9PM — invite top spenders.',
    kind: 'event',
    status: 'scheduled',
  },
  {
    id: 'n1',
    title: 'Studio tip',
    body: 'Pin a welcome message when you go live.',
    kind: 'announcement',
    status: 'draft',
  },
];

export function BroadcastScreen() {
  const { massTextAllActive, myLiveRoom, renameRoom } = useLiveStudio();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [items, setItems] = useState<Campaign[]>(SEED);
  const [filter, setFilter] = useState<'all' | Campaign['kind']>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [filter, items],
  );

  const publish = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      notify('Broadcast', 'Add a title and message');
      return;
    }
    const row: Campaign = {
      id: `b_${Date.now()}`,
      title: t,
      body: b,
      kind: 'announcement',
      status: 'live',
    };
    setItems((list) => [row, ...list]);
    const text = `${t}\n${b}`;
    const n = await massTextAllActive(text);
    if (myLiveRoom?.isLive) {
      try {
        await renameRoom(myLiveRoom.title);
      } catch {
        /* optional */
      }
    }
    setTitle('');
    setBody('');
    notify('Broadcast live', `Pushed to ${n} fans`);
  };

  const iconFor = (kind: Campaign['kind']) => {
    if (kind === 'event') return Calendar;
    if (kind === 'campaign') return Rocket;
    return Megaphone;
  };

  return (
    <PremiumShell padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BodyText mute style={styles.eyebrow}>
            REACH
          </BodyText>
          <DisplayText size={30}>Broadcast</DisplayText>
          <BodyText soft style={{ marginTop: 4 }}>
            Announcements · events · campaigns
          </BodyText>
        </View>

        <View style={{ paddingHorizontal: 18 }}>
          <GlassPanel pad={16}>
            <BodyText style={{ fontWeight: '800', marginBottom: 10 }}>New broadcast</BodyText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Headline"
              placeholderTextColor={premium.textMute}
              style={styles.input}
            />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Tell fans what’s happening…"
              placeholderTextColor={premium.textMute}
              style={[styles.input, { minHeight: 88 }]}
              multiline
            />
            <GradientCTA label="Publish to fans" onPress={() => void publish()} />
          </GlassPanel>

          <View style={styles.filters}>
            {(['all', 'announcement', 'event', 'campaign'] as const).map((f) => (
              <SoftPress key={f} onPress={() => setFilter(f)}>
                <View
                  style={[
                    styles.chip,
                    filter === f && { borderColor: premium.rose, backgroundColor: 'rgba(255,77,109,0.14)' },
                  ]}
                >
                  <BodyText
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: filter === f ? premium.rose : premium.textSoft,
                      textTransform: 'capitalize',
                    }}
                  >
                    {f}
                  </BodyText>
                </View>
              </SoftPress>
            ))}
          </View>

          <SectionLabel title="Your board" />
          {filtered.map((item) => {
            const Icon = iconFor(item.kind);
            return (
              <GlassPanel key={item.id} pad={14} style={{ marginBottom: 10 }}>
                <View style={styles.cardTop}>
                  <View style={styles.iconBubble}>
                    <Icon size={18} color={premium.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <BodyText style={{ fontWeight: '800' }}>{item.title}</BodyText>
                    <BodyText mute style={{ fontSize: 12, textTransform: 'capitalize' }}>
                      {item.kind} · {item.status}
                    </BodyText>
                  </View>
                  <Sparkles size={14} color={premium.teal} />
                </View>
                <BodyText soft style={{ marginTop: 10, lineHeight: 20 }}>
                  {item.body}
                </BodyText>
              </GlassPanel>
            );
          })}
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
    color: premium.gold,
    marginBottom: 4,
  },
  input: {
    borderRadius: premium.radius.md,
    borderWidth: 1,
    borderColor: premium.line,
    backgroundColor: 'rgba(0,0,0,0.25)',
    color: premium.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: premium.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,196,124,0.14)',
  },
});
