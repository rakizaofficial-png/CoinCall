import { StyleSheet, View } from 'react-native';

/** Web fallback — real camera mounts via DOM in LiveRoomScreen */
export function LiveBroadcastSurface({ cameraOff }: { cameraOff: boolean }) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: cameraOff ? '#05070F' : '#000' },
      ]}
    />
  );
}
