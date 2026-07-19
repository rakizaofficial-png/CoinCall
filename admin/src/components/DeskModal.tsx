import type { ReactNode } from 'react';

/** Inline desk modal — replaces browser alert/confirm/prompt flows */
export function DeskModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="desk-modal-root" role="dialog" aria-modal="true">
      <button
        type="button"
        className="desk-modal-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="desk-modal">
        <div className="desk-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="btn-ghost desk-icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="desk-modal-body">{children}</div>
        {footer ? <div className="desk-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function DeskField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="desk-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
