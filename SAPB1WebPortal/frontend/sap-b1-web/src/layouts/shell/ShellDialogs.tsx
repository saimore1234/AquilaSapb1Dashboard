import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useShell } from './ShellContext';
import { APP_VERSION } from './StatusBar';

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + K  /  Ctrl + F', 'Global search'],
  ['Alt + M', 'Open the modules menu'],
  ['Alt + H', 'Go to Home'],
  ['Esc', 'Close the open menu, popup or dialog']
];

export default function ShellDialogs() {
  const { dialog, closeDialog } = useShell();
  const { user } = useAuth();

  return (
    <>
      <Modal open={dialog === 'shortcuts'} onClose={closeDialog} labelledBy="shortcuts-title">
        <div className="p-5">
          <h2 id="shortcuts-title" className="text-base font-semibold text-ink-primary mb-3">
            Keyboard shortcuts
          </h2>
          <dl className="divide-y divide-border text-sm">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-ink-secondary">{d}</dt>
                <dd>
                  <kbd className="text-xs border border-border-strong rounded px-1.5 py-0.5 bg-surface-secondary">{k}</kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-tertiary mt-3">
            Save, New and Print keep their normal browser behaviour; each form saves with its own button.
          </p>
        </div>
      </Modal>

      <Modal open={dialog === 'about'} onClose={closeDialog} labelledBy="about-title">
        <div className="p-5">
          <h2 id="about-title" className="text-base font-semibold text-ink-primary">
            SAP B1 Business Hub
          </h2>
          <p className="text-xs text-ink-secondary mb-3">Business Management Platform — an independent companion app, not an official SAP product.</p>
          <dl className="text-sm divide-y divide-border">
            {[
              ['Version', APP_VERSION],
              ['Company', user?.companyName || user?.company],
              ['Database', user?.company],
              ['User', `${user?.username} (${user?.role})`]
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-ink-secondary">{k}</dt>
                <dd className="text-ink-primary text-right truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Modal>
    </>
  );
}
