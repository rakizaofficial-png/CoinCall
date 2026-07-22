import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHAT_THEME } from './chatTheme';

/**
 * Fixed header + scrollable body + fixed composer.
 * Android uses windowSoftInputMode=resize (app.config) — no full-screen shift.
 * iOS pads only the message area below the header.
 */
export function ChatThreadLayout({
  header,
  children,
  composer,
}: {
  header: ReactNode;
  children: ReactNode;
  composer: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: CHAT_THEME.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>{header}</View>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.body} behavior="padding" keyboardVerticalOffset={0}>
          <View style={styles.list}>{children}</View>
          {composer}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.body}>
          <View style={styles.list}>{children}</View>
          {composer}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_THEME.border,
    backgroundColor: CHAT_THEME.headerBg,
  },
  body: { flex: 1 },
  list: { flex: 1 },
});
