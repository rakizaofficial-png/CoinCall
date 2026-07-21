import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  uri?: string;
  size?: number;
  online?: boolean;
  ring?: boolean;
  name?: string;
};

function initialsFrom(name?: string, uri?: string) {
  const base = (name || uri || 'H').trim();
  const parts = base.replace(/https?:\/\/\S+/g, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0] + parts[1]![0]).toUpperCase();
  return (parts[0]?.[0] || 'H').toUpperCase();
}

export function Avatar({ uri, size = 56, online, ring, name }: Props) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  const initials = useMemo(() => initialsFrom(name, uri), [name, uri]);

  return (
    <View style={{ width: size, height: size }}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          onError={() => setFailed(true)}
          style={[
            styles.img,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: ring ? 2.5 : 0,
              borderColor: colors.primarySoft,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.img,
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: ring ? 2.5 : 0,
              borderColor: colors.primarySoft,
              backgroundColor: colors.bgSoft || '#1a1a2e',
            },
          ]}
        >
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: size * 0.34 }}>
            {initials}
          </Text>
        </View>
      )}
      {online != null ? (
        <View
          style={[
            styles.dot,
            {
              width: size * 0.22,
              height: size * 0.22,
              borderRadius: size,
              backgroundColor: online ? colors.online : colors.textMuted,
              borderColor: colors.bgCard,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: '#1a1a2e' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    borderWidth: 2,
  },
});
