import { Platform } from 'react-native';
import { getPremiumModal } from '../components/premium/premiumModalApi';

function inferVariant(title: string): 'success' | 'error' | 'warning' | 'info' {
  const t = title.toLowerCase();
  if (t.includes('fail') || t.includes('error') || t.includes('could not')) return 'error';
  if (t.includes('success') || t.includes('sent') || t.includes('live') || t.includes('thanks'))
    return 'success';
  if (t.includes('permission') || t.includes('warning') || t.includes('muted')) return 'warning';
  return 'info';
}

/**
 * Non-blocking premium toast on native + web.
 */
export function notify(title: string, message?: string) {
  const modal = getPremiumModal();
  if (modal) {
    modal.toast(title, message, { variant: inferVariant(title) });
    return;
  }

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

  // Fallback before provider mounts
  console.log('[notify]', text);
}

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = 'OK',
) {
  const modal = getPremiumModal();
  if (modal) {
    modal.confirm(title, message, onConfirm, confirmLabel);
    return;
  }
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  onConfirm();
}

export function promptChoices(
  title: string,
  message: string,
  choices: { label: string; onPress: () => void }[],
) {
  const modal = getPremiumModal();
  if (modal) {
    modal.choices(title, message, choices);
    return;
  }
  if (Platform.OS === 'web') {
    const list = choices.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
    const raw = window.prompt(`${title}\n\n${message}\n\n${list}\n\nEnter number:`);
    const idx = Number(raw) - 1;
    if (idx >= 0 && idx < choices.length) choices[idx].onPress();
    return;
  }
  choices[0]?.onPress();
}

export function promptText(
  title: string,
  message: string,
  onSubmit: (value: string) => void,
  defaultValue = '',
) {
  const modal = getPremiumModal();
  if (modal) {
    modal.prompt(title, message, onSubmit, { defaultValue });
    return;
  }
  if (Platform.OS === 'web') {
    const raw = window.prompt(`${title}\n\n${message}`, defaultValue);
    if (raw != null && raw.trim()) onSubmit(raw.trim());
    return;
  }
  if (defaultValue.trim()) onSubmit(defaultValue.trim());
}
