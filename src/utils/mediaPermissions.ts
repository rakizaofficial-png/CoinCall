import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';
import { notify } from '../utils/notify';

/** Android 11–15 + iOS: request gallery access; open Settings if permanently denied. */
export async function ensureMediaLibraryPermission(
  kind: 'photos' | 'videos' = 'photos',
): Promise<boolean> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.granted) return true;
  const label = kind === 'videos' ? 'videos' : 'photos';
  if (perm.canAskAgain === false) {
    Alert.alert(
      'Permission needed',
      `Allow photo library access in Settings so you can add ${label}.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return false;
  }
  notify('Permission', `Allow photo library access to pick ${label}.`);
  return false;
}

export async function ensureCameraPermission(): Promise<boolean> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.granted) return true;
  if (perm.canAskAgain === false) {
    Alert.alert(
      'Permission needed',
      'Allow camera access in Settings for your profile photo.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return false;
  }
  notify('Permission', 'Allow camera access.');
  return false;
}
