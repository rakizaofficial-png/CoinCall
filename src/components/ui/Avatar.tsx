import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  uri?: string;
  size?: number;
  online?: boolean;
  ring?: boolean;
};

export function Avatar({ uri, size = 56, online, ring }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={{ uri: uri || 'https://i.pravatar.cc/300?u=host' }}
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
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    borderWidth: 2,
  },
});
