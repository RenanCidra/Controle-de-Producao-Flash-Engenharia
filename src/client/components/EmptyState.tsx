import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="text-center py-14 px-6 bg-[#151C25] border border-dashed border-[#263342] rounded-xl shadow-xs">
      <Icon className="h-10 w-10 text-slate-400 mx-auto mb-3" />
      <h4 className="text-sm font-medium text-slate-300">{title}</h4>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-5 py-2.5 bg-[#E67E00] hover:bg-[#D97706] text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
