import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHAT_THEME } from './chatTheme';

const COMPOSER_HEIGHT = 64;

/**
 * Fixed header + scrollable message list + composer pinned above keyboard.
 * Android: windowSoftInputMode=resize — window shrinks, no full-screen shift.
 * iOS: manual keyboard offset on composer only.
 */
export function ChatThreadLayout({
  header,
  children,
  composer,
  listHeader,
}: {
  header: ReactNode;
  children: ReactNode;
  composer: ReactNode;
  listHeader?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isIos = Platform.OS === 'ios';

  useEffect(() => {
    if (!isIos) return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardHeight(Math.max(0, e.endCoordinates.height - insets.bottom));
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom, isIos]);

  const composerBottom = insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: CHAT_THEME.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>{header}</View>
      <View style={[styles.body, { paddingBottom: COMPOSER_HEIGHT + composerBottom + 8 }]}>
        {listHeader ? <View style={styles.listHeader}>{listHeader}</View> : null}
        <View style={styles.list}>{children}</View>
      </View>
      <View
        style={[
          styles.composerDock,
          {
            paddingBottom: composerBottom,
            transform:
              isIos && keyboardHeight > 0 ? [{ translateY: -keyboardHeight }] : undefined,
          },
        ]}
      >
        {composer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_THEME.border,
    backgroundColor: CHAT_THEME.headerBg,
    zIndex: 2,
  },
  body: { flex: 1 },
  listHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_THEME.border,
  },
  list: { flex: 1 },
  composerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CHAT_THEME.headerBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_THEME.border,
    zIndex: 3,
  },
});
