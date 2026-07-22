export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastOptions = {
  variant?: AlertVariant;
  durationMs?: number;
};

export type AlertOptions = {
  variant?: AlertVariant;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type PromptOptions = {
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type PremiumModalAPI = {
  toast: (title: string, message?: string, options?: ToastOptions) => void;
  alert: (
    title: string,
    message: string,
    options?: AlertOptions,
  ) => Promise<boolean>;
  confirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmLabel?: string,
  ) => void;
  choices: (
    title: string,
    message: string,
    choices: { label: string; onPress: () => void }[],
  ) => void;
  prompt: (
    title: string,
    message: string,
    onSubmit: (value: string) => void,
    options?: PromptOptions,
  ) => void;
};

let api: PremiumModalAPI | null = null;

export function registerPremiumModal(next: PremiumModalAPI | null) {
  api = next;
}

export function getPremiumModal(): PremiumModalAPI | null {
  return api;
}
