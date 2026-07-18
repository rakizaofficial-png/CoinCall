import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IncomingCallModal } from '../components/IncomingCallModal';
import { SplashScreen } from '../components/ui/SplashScreen';
import { AppProvider, useApp } from '../context/AppContext';
import { LiveStudioProvider } from '../context/LiveStudioContext';
import { useAuth } from '../context/AuthContext';
import { GoLiveScreen } from '../features/live/GoLiveScreen';
import { LiveRoomScreen } from '../features/live/LiveRoomScreen';
import { WithdrawScreen } from '../features/wallet/WithdrawScreen';
import { HostApplyScreen } from '../screens/auth/HostApplyScreen';
import { HostPendingScreen } from '../screens/auth/HostPendingScreen';
import { CallScreen } from '../screens/call/CallScreen';
import { ChatScreen } from '../screens/main/ChatScreen';
import { HostProfileScreen } from '../screens/main/HostProfileScreen';
import { NotificationsScreen } from '../screens/main/NotificationsScreen';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { useTheme } from '../theme/ThemeContext';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function HostGate() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.hostStatus === 'pending') return <HostPendingScreen />;
  return <HostApplyScreen />;
}

function BridgeIncomingLayer() {
  const { incomingBridgeCall, clearIncomingBridgeCall } = useApp();
  return (
    <IncomingCallModal
      call={incomingBridgeCall}
      onClear={clearIncomingBridgeCall}
    />
  );
}

function GoLiveRoute({ navigation, route }: any) {
  return <GoLiveScreen navigation={navigation} mode={route.params?.mode || 'solo'} />;
}

function AuthenticatedApp() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <AppProvider initialUser={user}>
      <LiveStudioProvider>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="HostProfile" component={HostProfileScreen} />
          <Stack.Screen name="Call" component={CallScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="GoLive" component={GoLiveRoute} />
          <Stack.Screen name="LiveRoom" component={LiveRoomScreen} />
          <Stack.Screen name="Withdraw" component={WithdrawScreen} />
        </Stack.Navigator>
        <BridgeIncomingLayer />
      </LiveStudioProvider>
    </AppProvider>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isHostApproved, authReady } = useAuth();
  const { colors, isDark } = useTheme();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.bg,
      card: colors.bgElevated,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  if (!authReady) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : isHostApproved ? (
        <AuthenticatedApp />
      ) : (
        <HostGate />
      )}
    </NavigationContainer>
  );
}
