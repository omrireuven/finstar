import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/*
        Backdrop and panel are separate fixed siblings so the backdrop's
        backdrop-filter: blur() cannot bleed into the modal panel content.
      */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm modal-overlay" onClick={onClose} />

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        dir="rtl"
      >
        <div
          className={clsx(
            'modal-panel pointer-events-auto bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto',
            sizes[size]
          )}
          style={{ border: '1px solid rgba(226,232,240,0.6)' }}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid #f1f5f9' }}
          >
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={17} />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </>,
    document.body
  );
}
