import { LinearGradient } from 'expo-linear-gradient';
import { Download, ShieldAlert } from 'lucide-react-native';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getHostAppVersion,
  pickStoreUrl,
  type HostAppUpdateConfig,
} from '../../services/appUpdateService';
import { useTheme } from '../../theme/ThemeContext';

/**
 * Full-screen blocker — cannot dismiss while admin force-update is ON
 * and this build is below minVersion.
 */
export function ForceUpdateScreen({ config }: { config: HostAppUpdateConfig }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = getHostAppVersion();
  const storeUrl = pickStoreUrl(config);

  const openStore = () => {
    const url =
      storeUrl ||
      (Platform.OS === 'ios'
        ? 'https://apps.apple.com'
        : Platform.OS === 'android'
          ? 'https://play.google.com/store'
          : config.webUpdateUrl || 'https://coincall-host.onrender.com');
    void Linking.openURL(url);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient
        colors={['rgba(255,77,122,0.22)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.card, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
        <View style={styles.iconWrap}>
          <ShieldAlert color="#ff4d7a" size={36} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {config.title || 'Update required'}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {config.message ||
            'Please update the CoinCall Host app to continue.'}
        </Text>

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            Installed · {current}
          </Text>
          <Text style={[styles.meta, { color: '#ff4d7a' }]}>
            Required · {config.minVersion}
          </Text>
        </View>
        {config.latestVersion ? (
          <Text style={[styles.meta, { color: colors.textMuted, marginTop: 6 }]}>
            Latest · {config.latestVersion}
          </Text>
        ) : null}

        <Pressable
          onPress={openStore}
          style={({ pressed }) => [
            styles.cta,
            { opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <Download color="#fff" size={20} />
          <Text style={styles.ctaText}>Update now</Text>
        </Pressable>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          This screen was enabled by Super Admin. The app stays locked until you
          install the required version.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,77,122,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  meta: {
    fontSize: 12,
    fontWeight: '700',
  },
  cta: {
    marginTop: 22,
    backgroundColor: '#ff4d7a',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  hint: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
