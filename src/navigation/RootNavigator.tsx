import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { IncomingCallModal } from '../components/IncomingCallModal';
import { SplashScreen } from '../components/ui/SplashScreen';
import { AppProvider, useApp } from '../context/AppContext';
import { LiveStudioProvider } from '../context/LiveStudioContext';
import { useAuth } from '../context/AuthContext';
import { CallingScreen } from '../features/calling/CallingScreen';
import { GoLiveScreen } from '../features/live/GoLiveScreen';
import { LiveRoomScreen } from '../features/live/LiveRoomScreen';
import { WithdrawScreen } from '../features/wallet/WithdrawScreen';
import { HostApplyScreen } from '../screens/auth/HostApplyScreen';
import { HostPendingScreen } from '../screens/auth/HostPendingScreen';
import { CallScreen } from '../screens/call/CallScreen';
import { ChatScreen } from '../screens/main/ChatScreen';
import { EarningsScreen } from '../screens/main/EarningsScreen';
import { EditHostProfileScreen } from '../screens/main/EditHostProfileScreen';
import { FanProfileScreen } from '../screens/main/FanProfileScreen';
import { HelpCenterScreen } from '../screens/main/HelpCenterScreen';
import { HostProfileScreen } from '../screens/main/HostProfileScreen';
import { NotificationsScreen } from '../screens/main/NotificationsScreen';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { SystemInformationScreen } from '../screens/main/SystemInformationScreen';
import { useTheme } from '../theme/ThemeContext';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';
import { useHostForceUpdate } from '../hooks/useHostForceUpdate';
import { ForceUpdateScreen } from '../screens/system/ForceUpdateScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function HostGate() {
  const { user } = useAuth();
  if (!user) return null;
  if (
    user.hostStatus === 'pending' ||
    user.hostStatus === 'under_review' ||
    user.hostStatus === 'suspended' ||
    user.hostStatus === 'banned' ||
    user.hostStatus === 'rejected'
  ) {
    return <HostPendingScreen />;
  }
  return <HostApplyScreen />;
}

function BridgeIncomingLayer() {
  const { incomingBridgeCall, clearIncomingBridgeCall } = useApp();
  const [hostBusyOnCall, setBusy] = useState(false);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void import('../services/hostCallBusy').then(({ subscribeHostCallBusy }) => {
      unsub = subscribeHostCallBusy(setBusy);
    });
    return () => unsub?.();
  }, []);
  return (
    <IncomingCallModal
      call={incomingBridgeCall}
      onClear={clearIncomingBridgeCall}
      hostBusyOnCall={hostBusyOnCall}
    />
  );
}

function GoLiveRoute({ navigation }: any) {
  return <GoLiveScreen navigation={navigation} mode="solo" />;
}

function AuthenticatedApp() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    let unsub: (() => void) | undefined;
    void import('../services/hostPushService').then(({ registerHostPushToken, listenHostPush }) => {
      void registerHostPushToken(user.id);
      unsub = listenHostPush((title, body) => {
        void import('../utils/notify').then(({ notify }) => notify(title, body));
      });
    });
    return () => unsub?.();
  }, [user?.id]);

  if (!user) return null;

  return (
    <AppProvider initialUser={user}>
      <LiveStudioProvider>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="HostProfile" component={HostProfileScreen} />
          <Stack.Screen name="FanProfile" component={FanProfileScreen} />
          <Stack.Screen name="Call" component={CallScreen} />
          <Stack.Screen name="DirectChat" component={ChatScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="SystemInformation" component={SystemInformationScreen} />
          <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
          <Stack.Screen name="GoLive" component={GoLiveRoute} />
          <Stack.Screen name="LiveRoom" component={LiveRoomScreen} />
          <Stack.Screen name="Withdraw" component={WithdrawScreen} />
          <Stack.Screen name="Earnings" component={EarningsScreen} />
          <Stack.Screen name="EditHostProfile" component={EditHostProfileScreen} />
          <Stack.Screen name="Calling" component={CallingScreen} />
        </Stack.Navigator>
        <BridgeIncomingLayer />
      </LiveStudioProvider>
    </AppProvider>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isHostApproved, authReady } = useAuth();
  const { colors, isDark } = useTheme();
  const { ready: updateReady, blocked, config } = useHostForceUpdate();

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

  if (!authReady || !updateReady) {
    return <SplashScreen />;
  }

  // Admin force-update blocks the entire host app until they install
  if (blocked && config) {
    return <ForceUpdateScreen config={config} />;
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
