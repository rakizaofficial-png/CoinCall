import { Alert, Platform } from 'react-native';

/**
 * Non-blocking toast on web (never window.alert — that blocks Attend on incoming calls).
 * Native still uses Alert for important messages.
 */
export function notify(title: string, message?: string) {
  const text = message ? `${title} · ${message}` : title;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    let host = document.getElementById('coincall-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'coincall-toast-host';
      host.style.cssText =
        'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:92vw;';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      'background:rgba(26,16,40,0.96);color:#fff;padding:12px 16px;border-radius:14px;font:600 13px/1.35 system-ui,sans-serif;border:1px solid rgba(255,255,255,0.12);box-shadow:0 10px 30px rgba(0,0,0,0.35);';
    host.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s';
      setTimeout(() => el.remove(), 280);
    }, 2400);
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

/** Simple text prompt (web prompt / native Alert with default value). */
export function promptText(
  title: string,
  message: string,
  onSubmit: (value: string) => void,
  defaultValue = '',
) {
  if (Platform.OS === 'web') {
    const raw = window.prompt(`${title}\n\n${message}`, defaultValue);
    if (raw != null && raw.trim()) onSubmit(raw.trim());
    return;
  }
  if (typeof Alert.prompt === 'function') {
    Alert.prompt(
      title,
      message,
      (value) => {
        if (value?.trim()) onSubmit(value.trim());
      },
      'plain-text',
      defaultValue,
    );
    return;
  }
  // Android fallback
  Alert.alert(title, `${message}${defaultValue ? `\n\nCurrent: ${defaultValue}` : ''}`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'OK',
      onPress: () => {
        if (defaultValue.trim()) onSubmit(defaultValue.trim());
      },
    },
  ]);
}
