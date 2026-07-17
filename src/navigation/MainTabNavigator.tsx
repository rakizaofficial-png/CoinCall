import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DiscoverScreen } from '../screens/main/DiscoverScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { WalletScreen } from '../screens/main/WalletScreen';
import { colors } from '../theme/colors';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const iconName =
            route.name === 'Discover'
              ? 'grid-outline'
              : route.name === 'Wallet'
                ? 'wallet-outline'
                : 'person-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
