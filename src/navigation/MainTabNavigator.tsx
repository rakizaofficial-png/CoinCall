import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Heart, Radio, UserRound, Wallet } from 'lucide-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { HomeScreen } from '../screens/main/HomeScreen';
import { LiveScreen } from '../screens/main/LiveScreen';
import { EarningsScreen } from '../screens/main/EarningsScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { useTheme } from '../theme/ThemeContext';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11, marginBottom: 2 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarBackground:
          Platform.OS === 'ios'
            ? () => (
                <BlurView
                  intensity={60}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                />
              )
            : undefined,
        tabBarIcon: ({ color, size, focused }) => {
          const Icon =
            route.name === 'Home'
              ? Heart
              : route.name === 'Live'
                ? Radio
                : route.name === 'Earnings'
                  ? Wallet
                  : UserRound;
          return (
            <View
              style={[
                styles.iconWrap,
                focused && { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Icon
                size={size}
                color={color}
                fill={route.name === 'Home' && focused ? color : 'transparent'}
                strokeWidth={2.2}
              />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Studio' }} />
      <Tab.Screen name="Live" component={LiveScreen} options={{ title: 'Live' }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Wallet' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Me' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
});
