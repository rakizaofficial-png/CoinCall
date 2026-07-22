import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  ChevronRight,
  Headphones,
  HelpCircle,
  Info,
  ShieldAlert,
} from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHAT_THEME } from './chatTheme';
import { PressableScale } from '../premium/motion';

type Props = {
  onNavigate: (screen: 'SystemInformation' | 'HelpCenter' | 'Notifications') => void;
};

const LINKS = [
  {
    key: 'faq',
    title: 'FAQ',
    subtitle: 'Common questions & answers',
    Icon: HelpCircle,
    screen: 'SystemInformation' as const,
  },
  {
    key: 'help',
    title: 'Help Center',
    subtitle: 'Contact support & open tickets',
    Icon: Headphones,
    screen: 'HelpCenter' as const,
  },
  {
    key: 'admin',
    title: 'Contact Admin',
    subtitle: 'Reach CoinCall administrator',
    Icon: Bell,
    screen: 'HelpCenter' as const,
  },
  {
    key: 'report',
    title: 'Report Issue',
    subtitle: 'Flag a problem or abuse',
    Icon: ShieldAlert,
    screen: 'HelpCenter' as const,
  },
  {
    key: 'app',
    title: 'App Information',
    subtitle: 'Version, host ID, legal & device',
    Icon: Info,
    screen: 'SystemInformation' as const,
  },
];

/** Pinned Telegram-style system profile card at top of admin/system chats. */
export function ChatSystemProfileHeader({ onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <PressableScale onPress={() => setOpen(true)} style={styles.card}>
        <LinearGradient
          colors={['rgba(108,124,255,0.35)', 'rgba(168,85,247,0.2)']}
          style={styles.cardGrad}
        >
          <View style={styles.cardIcon}>
            <Info size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>System Information</Text>
            <Text style={styles.cardSub}>FAQ · Help · Admin · App info</Text>
          </View>
          <ChevronRight size={18} color="rgba(255,255,255,0.55)" />
        </LinearGradient>
      </PressableScale>

      <Modal visible={open} transparent animationType="none" statusBarTranslucent>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <Animated.View
            entering={SlideInDown.springify().damping(18)}
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          >
            <Animated.View entering={FadeIn.duration(220)}>
              <LinearGradient
                colors={['#1A1030', '#121826']}
                style={styles.hero}
              >
                <View style={styles.heroIcon}>
                  <Info size={32} color="#fff" />
                </View>
                <Text style={styles.heroTitle}>System Information</Text>
                <Text style={styles.heroSub}>
                  Official CoinCall host support hub
                </Text>
              </LinearGradient>

              <ScrollView style={styles.linkList} showsVerticalScrollIndicator={false}>
                {LINKS.map((item) => (
                  <Pressable
                    key={item.key}
                    style={styles.linkRow}
                    onPress={() => {
                      setOpen(false);
                      onNavigate(item.screen);
                    }}
                  >
                    <View style={styles.linkIcon}>
                      <item.Icon size={18} color={CHAT_THEME.coral} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkTitle}>{item.title}</Text>
                      <Text style={styles.linkSub}>{item.subtitle}</Text>
                    </View>
                    <ChevronRight size={16} color="rgba(255,255,255,0.4)" />
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { margin: 12, borderRadius: 16, overflow: 'hidden' },
  cardGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(108,124,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: '#fff', fontWeight: '900', fontSize: 15 },
  cardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#0E1422',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  hero: {
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(108,124,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { color: '#fff', fontWeight: '900', fontSize: 22 },
  heroSub: { color: 'rgba(255,255,255,0.55)', marginTop: 4, fontSize: 13 },
  linkList: { paddingHorizontal: 16, paddingTop: 8 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  linkSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  closeBtn: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontWeight: '800' },
});
