import { X } from 'lucide-react-native';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

export function ImageViewerModal({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
          <X size={24} color="#fff" />
        </Pressable>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  close: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    padding: 8,
  },
  image: { width: '100%', height: '80%' },
});
