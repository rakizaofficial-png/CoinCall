import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const LUMA_URL =
  process.env.EXPO_PUBLIC_LUMA_URL?.trim() || 'https://luma-user.onrender.com';

export default function App() {
  const [loading, setLoading] = useState(true);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <WebView
          source={{ uri: LUMA_URL }}
          style={styles.web}
          onLoadEnd={() => setLoading(false)}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          originWhitelist={['https://*', 'http://*']}
          onPermissionRequest={(event) => {
            event.nativeEvent.grant(event.nativeEvent.resources);
          }}
        />
        {loading ? (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator size="large" color="#FF4D6D" />
          </View>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A1018',
  },
  web: {
    flex: 1,
    backgroundColor: '#0A1018',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A1018',
  },
});
