import React, { useState } from 'react';
import { Smile } from 'lucide-react';
import { translateText } from '../i18n/index.ts';

const EMOJIS = ['😀','😁','😂','🤣','😊','😍','🥰','😎','🤔','😮','😢','🙏','👍','👎','👏','💪','✅','⚠️','🔥','🎉','❤️','👀','📦','🏭','🛠️','🚀'];

export const EmojiPicker: React.FC<{ onSelect: (emoji: string) => void; label?: string }> = ({ onSelect, label = 'Inserir emoji' }) => {
  const [open, setOpen] = useState(false);
  return <div className="relative shrink-0">
    <button type="button" onClick={() => setOpen(value => !value)} title={label} aria-label={label} aria-expanded={open} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#DCE3EB] bg-white text-slate-500 hover:border-[#FFAA00] hover:text-[#916B19]"><Smile size={18}/></button>
    {open && <><button type="button" aria-label={translateText('Fechar seletor de emojis')} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)}/><div role="group" aria-label={translateText('Emojis')} className="absolute bottom-12 left-0 z-30 grid w-64 grid-cols-8 gap-1 rounded-xl border border-[#DCE3EB] bg-white p-2 shadow-xl">{EMOJIS.map(emoji => <button key={emoji} type="button" onClick={() => { onSelect(emoji); setOpen(false); }} className="rounded-md p-1.5 text-xl hover:bg-amber-50" aria-label={emoji}>{emoji}</button>)}</div></>}
  </div>;
};
