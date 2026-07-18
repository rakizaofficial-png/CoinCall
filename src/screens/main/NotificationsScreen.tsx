import { Bell, ChevronLeft, Phone, Radio, Wallet } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/ui/GlassCard';
import { Screen } from '../../components/ui/Screen';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

const ITEMS = [
  {
    id: '1',
    icon: Phone,
    title: 'Incoming call alerts',
    body: 'Get notified when a viewer requests a 1:1 call.',
    time: 'System',
  },
  {
    id: '2',
    icon: Radio,
    title: 'Go live reminder',
    body: 'Hosts who go live in the evening earn more gifts.',
    time: 'Tip',
  },
  {
    id: '3',
    icon: Wallet,
    title: 'Withdraw ready',
    body: 'Your wallet balance can be cashed out via EasyPaisa.',
    time: 'Wallet',
  },
];

export function NotificationsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Screen scroll contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <ChevronLeft size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Call alerts, live tips, and wallet updates
      </Text>

      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <GlassCard key={item.id} style={styles.card}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Icon size={20} color={colors.primarySoft} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.itemBody, { color: colors.textSecondary }]}>
                {item.body}
              </Text>
              <Text style={[styles.itemTime, { color: colors.textMuted }]}>{item.time}</Text>
            </View>
          </GlassCard>
        );
      })}

      <View style={[styles.emptyHint, { borderColor: colors.border }]}>
        <Bell size={18} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          Push delivery uses your device notification settings.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { marginBottom: 16, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontWeight: '800', fontSize: 15 },
  itemBody: { marginTop: 4, lineHeight: 19, fontSize: 13 },
  itemTime: { marginTop: 6, fontSize: 11, fontWeight: '700' },
  emptyHint: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
