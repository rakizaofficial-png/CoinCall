import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import {
  Home,
  Megaphone,
  MessageCircle,
  Radio,
  UserRound,
} from 'lucide-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { FontBootstrap } from '../components/premium/PremiumChrome';
import { BroadcastScreen } from '../features/broadcast/BroadcastScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { LiveHubScreen } from '../features/live/LiveHubScreen';
import { MessagesScreen } from '../features/messages/MessagesScreen';
import { MeScreen } from '../features/me/MeScreen';
import { premium } from '../theme/premium';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <>
      <FontBootstrap />
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: premium.rose,
          tabBarInactiveTintColor: premium.textMute,
          tabBarLabelStyle: {
            fontWeight: '700',
            fontSize: 10,
            marginBottom: 2,
            fontFamily: Platform.OS === 'web' ? premium.fonts.body : undefined,
          },
          tabBarStyle: {
            position: 'absolute',
            backgroundColor:
              Platform.OS === 'ios' ? 'transparent' : 'rgba(10,12,18,0.94)',
            borderTopColor: premium.line,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: 74,
            paddingBottom: 12,
            paddingTop: 8,
            elevation: 0,
          },
          tabBarBackground:
            Platform.OS === 'ios'
              ? () => (
                  <BlurView
                    intensity={70}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                  />
                )
              : undefined,
          tabBarIcon: ({ color, size, focused }) => {
            const Icon =
              route.name === 'Home'
                ? Home
                : route.name === 'Live'
                  ? Radio
                  : route.name === 'Messages'
                    ? MessageCircle
                    : route.name === 'Broadcast'
                      ? Megaphone
                      : UserRound;
            return (
              <View
                style={[
                  styles.iconWrap,
                  focused && { backgroundColor: 'rgba(255,77,109,0.16)' },
                ]}
              >
                <Icon size={size} color={color} strokeWidth={2.2} />
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
        <Tab.Screen name="Live" component={LiveHubScreen} options={{ title: 'Live' }} />
        <Tab.Screen
          name="Messages"
          component={MessagesScreen}
          options={{ title: 'Messages' }}
        />
        <Tab.Screen
          name="Broadcast"
          component={BroadcastScreen}
          options={{ title: 'Broadcast' }}
        />
        <Tab.Screen name="Me" component={MeScreen} options={{ title: 'Me' }} />
      </Tab.Navigator>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
});
