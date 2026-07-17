import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

export function DiscoverScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discover</Text>
      <Text style={styles.body}>
        Host grid coming in step 2. This tab is a navigation shell placeholder.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
  },
});
