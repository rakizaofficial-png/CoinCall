import { LinearGradient } from 'expo-linear-gradient';
import { Gift, Sparkles, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  adultGifts,
  giftsByCategory,
  type GiftItem,
} from '../../data/gifts';
import { radii } from '../../theme/colors';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  onSelect: (gift: GiftItem) => void;
  busy?: boolean;
  /** Show adult tab (default true for host tools) */
  showAdult?: boolean;
};

export function HostGiftPicker({
  visible,
  onClose,
  title = 'Ask for a gift',
  subtitle = 'Fan pays coins · you earn instantly',
  onSelect,
  busy,
  showAdult = true,
}: Props) {
  const [tab, setTab] = useState<'standard' | 'adult'>('standard');
  const items = useMemo(
    () => (tab === 'adult' ? adultGifts() : giftsByCategory('standard')),
    [tab],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.sub}>{subtitle}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <X size={20} color="#fff" />
            </Pressable>
          </View>

          {showAdult ? (
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, tab === 'standard' && styles.tabOn]}
                onPress={() => setTab('standard')}
              >
                <Gift size={14} color={tab === 'standard' ? '#1a1200' : '#fff'} />
                <Text
                  style={[styles.tabText, tab === 'standard' && styles.tabTextOn]}
                >
                  Glamour
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, tab === 'adult' && styles.tabAdultOn]}
                onPress={() => setTab('adult')}
              >
                <Sparkles size={14} color={tab === 'adult' ? '#fff' : '#FF8AB5'} />
                <Text
                  style={[styles.tabText, tab === 'adult' && styles.tabTextOn]}
                >
                  Adult 18+
                </Text>
              </Pressable>
            </View>
          ) : null}

          {tab === 'adult' ? (
            <Text style={styles.adultHint}>
              Exclusive gifts unlock locked live photos & private moments
            </Text>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {items.map((g) => (
              <Pressable
                key={g.id}
                disabled={busy}
                onPress={() => onSelect(g)}
                style={[styles.card, busy && { opacity: 0.5 }]}
              >
                <LinearGradient
                  colors={g.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardGrad}
                >
                  <Text style={styles.emoji}>{g.emoji}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.coins}>{g.coins} coins</Text>
                  {g.isAdult ? (
                    <View style={styles.adultBadge}>
                      <Text style={styles.adultBadgeText}>18+</Text>
                    </View>
                  ) : null}
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: '#0E1220',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,42,122,0.35)',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '900' },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 4 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabOn: {
    backgroundColor: '#F5C14C',
    borderColor: '#F5C14C',
  },
  tabAdultOn: {
    backgroundColor: '#FF2A7A',
    borderColor: '#FF6BA8',
  },
  tabText: { color: 'rgba(255,255,255,0.75)', fontWeight: '800', fontSize: 13 },
  tabTextOn: { color: '#fff' },
  adultHint: {
    color: '#FF8AB5',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 12,
  },
  card: {
    width: '47.5%',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  cardGrad: {
    padding: 14,
    minHeight: 110,
    justifyContent: 'flex-end',
  },
  emoji: { fontSize: 28, marginBottom: 6 },
  name: { color: '#fff', fontWeight: '800', fontSize: 13 },
  coins: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    fontSize: 11,
    marginTop: 2,
  },
  adultBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adultBadgeText: { color: '#FFB4D0', fontSize: 10, fontWeight: '900' },
});
