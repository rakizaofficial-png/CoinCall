import { Bell, CheckCheck, ChevronLeft, Phone, Radio, Trash2, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/ui/GlassCard';
import { Screen } from '../../components/ui/Screen';
import { useApp } from '../../context/AppContext';
import {
  clearNotification,
  listenHostNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InboxNotification,
} from '../../services/notificationInboxService';
import { radii } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

function iconFor(type: string) {
  if (type === 'call') return Phone;
  if (type === 'payout') return Wallet;
  if (type === 'live') return Radio;
  return Bell;
}

export function NotificationsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useApp();
  const [items, setItems] = useState<InboxNotification[]>([]);

  useEffect(() => {
    return listenHostNotifications(user.id, setItems);
  }, [user.id]);

  const unread = items.filter((i) => !i.read);

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
        <Pressable
          onPress={() => markAllNotificationsRead(user.id, unread.map((i) => i.id))}
          hitSlop={8}
          accessibilityLabel="Mark all read"
        >
          <CheckCheck size={22} color={colors.primarySoft} />
        </Pressable>
      </View>

      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        {unread.length} unread · synced from your host inbox
      </Text>

      {items.length === 0 ? (
        <View style={[styles.emptyHint, { borderColor: colors.border }]}>
          <Bell size={18} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No notifications yet. Call alerts, payouts, and chat messages appear here.
          </Text>
        </View>
      ) : (
        items.map((item) => {
          const Icon = iconFor(item.type);
          return (
            <Pressable
              key={item.id}
              onPress={() => markNotificationRead(user.id, item.id)}
            >
              <GlassCard
                style={[
                  styles.card,
                  !item.read && { borderColor: colors.primarySoft },
                ]}
              >
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
                  <Text style={[styles.itemTime, { color: colors.textMuted }]}>
                    {new Date(item.createdAt).toLocaleString()}
                    {!item.read ? ' · Unread' : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => clearNotification(user.id, item.id)}
                  hitSlop={10}
                  accessibilityLabel="Delete notification"
                >
                  <Trash2 size={18} color={colors.textMuted} />
                </Pressable>
              </GlassCard>
            </Pressable>
          );
        })
      )}
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
