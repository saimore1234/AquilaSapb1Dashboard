import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 'top' = command-palette style, anchored near the top of the viewport.
   *  'sheet' = centered dialog on desktop, slides up from the bottom on mobile.
   *  'large' = near-full-screen workspace (~92vw, up to 1600px, ~88vh) for
   *  multi-section forms that don't fit a small dialog — full-screen on mobile. */
  variant?: 'top' | 'sheet' | 'large';
  labelledBy?: string;
}

export default function Modal({ open, onClose, children, variant = 'sheet', labelledBy }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex justify-center overflow-y-auto p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={variant === 'top' ? { opacity: 0, y: -12, scale: 0.98 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={variant === 'top' ? { opacity: 0, y: -8, scale: 0.98 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={
              variant === 'top'
                ? 'relative z-10 w-full sm:max-w-xl mt-0 sm:mt-24 self-start bg-surface sm:rounded-2xl shadow-popover border border-border h-full sm:h-auto sm:max-h-[70vh] flex flex-col'
                : variant === 'large'
                  ? 'relative z-10 w-full h-full sm:w-[92vw] sm:max-w-[1600px] sm:h-[88vh] mt-0 sm:mt-[3vh] bg-surface sm:rounded-2xl shadow-popover border border-border flex flex-col'
                  : 'relative z-10 w-full sm:max-w-lg mt-auto sm:mt-24 sm:mb-auto bg-surface rounded-t-2xl sm:rounded-2xl shadow-popover border border-border flex flex-col max-h-[85vh]'
            }
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
