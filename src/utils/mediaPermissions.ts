import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { Linking } from 'react-native';
import { confirmAction, notify } from './notify';

export type CallMediaPermissionResult =
  | { granted: true }
  | { granted: false; reason: 'camera' | 'microphone' | 'blocked' };

/**
 * Requests the permissions used by the Agora call engine, not the profile
 * image-picker permission. Call this before allocating a native RTC engine.
 */
export async function ensureCallMediaPermissions(): Promise<CallMediaPermissionResult> {
  const camera = await Camera.requestCameraPermissionsAsync();
  const microphone = await Camera.requestMicrophonePermissionsAsync();
  if (camera.granted && microphone.granted) return { granted: true };

  const blocked = camera.canAskAgain === false || microphone.canAskAgain === false;
  const missing = !camera.granted ? 'camera' : 'microphone';
  if (blocked) {
    confirmAction(
      'Camera and microphone permission needed',
      'Allow camera and microphone access in Settings to join a video call.',
      () => void Linking.openSettings(),
      'Open Settings',
    );
    return { granted: false, reason: 'blocked' };
  }
  notify(
    'Permission needed',
    `Allow ${missing} access before joining the video call.`,
  );
  return { granted: false, reason: missing };
}

/** Android 11–15 + iOS: request gallery access; open Settings if permanently denied. */
export async function ensureMediaLibraryPermission(
  kind: 'photos' | 'videos' = 'photos',
): Promise<boolean> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.granted) return true;
  const label = kind === 'videos' ? 'videos' : 'photos';
  if (perm.canAskAgain === false) {
    confirmAction(
      'Permission needed',
      `Allow photo library access in Settings so you can add ${label}.`,
      () => void Linking.openSettings(),
      'Open Settings',
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
    confirmAction(
      'Permission needed',
      'Allow camera access in Settings for your profile photo.',
      () => void Linking.openSettings(),
      'Open Settings',
    );
    return false;
  }
  notify('Permission', 'Allow camera access.');
  return false;
}
