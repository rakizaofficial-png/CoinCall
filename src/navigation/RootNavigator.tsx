import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppProvider } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { HostApplyScreen } from '../screens/auth/HostApplyScreen';
import { HostPendingScreen } from '../screens/auth/HostPendingScreen';
import { CallScreen } from '../screens/call/CallScreen';
import { ChatScreen } from '../screens/main/ChatScreen';
import { HostProfileScreen } from '../screens/main/HostProfileScreen';
import { colors } from '../theme/colors';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function HostGate() {
  const { user } = useAuth();
  if (!user) return null;

  // Waiting for admin — show Host ID only, no hosting app
  if (user.hostStatus === 'pending') {
    return <HostPendingScreen />;
  }

  // Not submitted yet, or rejected → application form
  return <HostApplyScreen />;
}

function AuthenticatedApp() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <AppProvider initialUser={user}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Screen name="HostProfile" component={HostProfileScreen} />
        <Stack.Screen name="Call" component={CallScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </AppProvider>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isHostApproved, authReady } = useAuth();

  if (!authReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primarySoft} size="large" />
      </View>
    );
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
