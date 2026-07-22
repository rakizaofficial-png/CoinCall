import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Text, TextInput } from 'react-native';
import { font } from '../../theme/fonts';

type Props = { children: ReactNode };

type WithDefaultProps = { defaultProps?: { style?: object } };

/**
 * Loads DM Sans once and applies it as the default Text/TextInput face
 * so typography stays consistent across the app without per-screen patches.
 */
export function FontProvider({ children }: Props) {
  const [loaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (!loaded) return;
    const textStyle = { fontFamily: font.regular };
    const T = Text as unknown as WithDefaultProps;
    const I = TextInput as unknown as WithDefaultProps;
    T.defaultProps = { ...(T.defaultProps || {}), style: textStyle };
    I.defaultProps = { ...(I.defaultProps || {}), style: textStyle };
  }, [loaded]);

  if (!loaded) return null;
  return <>{children}</>;
}
