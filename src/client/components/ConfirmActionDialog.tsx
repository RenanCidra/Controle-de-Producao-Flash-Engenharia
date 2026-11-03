import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface ConfirmActionDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  itemLabel: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  isOpen, title, description, itemLabel, confirmLabel = 'Excluir registro', busy = false, onCancel, onConfirm,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#151C25] p-5 text-white shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-full bg-rose-500/10 p-2 text-rose-300"><AlertTriangle size={18}/></span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-action-title" className="text-sm font-semibold">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-300">{description}</p>
            <p className="mt-3 break-words rounded-lg border border-slate-700 bg-[#0F151D] px-3 py-2 text-xs font-medium text-slate-100">{itemLabel}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">Cancelar</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50"><Trash2 size={14}/>{busy ? 'Excluindo…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
};
