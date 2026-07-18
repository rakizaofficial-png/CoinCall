import { Alert, Platform } from 'react-native';

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    // React Native Alert is unreliable on web
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = 'OK',
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, onPress: onConfirm },
  ]);
}

export function promptChoices(
  title: string,
  message: string,
  choices: { label: string; onPress: () => void }[],
) {
  if (Platform.OS === 'web') {
    const list = choices.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
    const raw = window.prompt(`${title}\n\n${message}\n\n${list}\n\nEnter number:`);
    const idx = Number(raw) - 1;
    if (idx >= 0 && idx < choices.length) choices[idx].onPress();
    return;
  }
  Alert.alert(title, message, [
    ...choices.map((c) => ({ text: c.label, onPress: c.onPress })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
