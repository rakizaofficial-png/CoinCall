import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';

export function RootNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
