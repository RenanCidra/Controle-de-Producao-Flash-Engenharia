import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight, Circle, Eye, EyeOff, PenLine, RotateCcw, Save, Trash2, Type, X,
} from 'lucide-react';
import type { DrawingOverlayData, DrawingPoint, DrawingStroke, DrawingTool } from '../api.ts';
import { translateText } from '../i18n/index.ts';
import { DrawingOverlaySvg } from './DrawingOverlaySvg.tsx';

interface ImageAnnotationModalProps {
  open: boolean;
  imageUrl: string;
  initialDrawing?: DrawingOverlayData | null;
  title?: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave?: (drawingData: DrawingOverlayData) => Promise<void>;
}

const PALETTE = [
  { hex: '#EF4444', label: 'Vermelho' },
  { hex: '#FFAA00', label: 'Âmbar' },
  { hex: '#0EA5E9', label: 'Azul' },
  { hex: '#10B981', label: 'Verde' },
  { hex: '#FFFFFF', label: 'Branco' },
];

export const ImageAnnotationModal: React.FC<ImageAnnotationModalProps> = ({
  open,
  imageUrl,
  initialDrawing,
  title = 'Anotar imagem',
  readOnly = false,
  onClose,
  onSave,
}) => {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [draftStroke, setDraftStroke] = useState<DrawingStroke | null>(null);
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState('#EF4444');
  const [showOriginalOnly, setShowOriginalOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 1000, h: 750 });

  const [textDraftPoint, setTextDraftPoint] = useState<DrawingPoint | null>(null);
  const [textInput, setTextInput] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setStrokes(Array.isArray(initialDrawing?.strokes) ? initialDrawing.strokes : []);
    setDraftStroke(null);
    setShowOriginalOnly(false);
    setTextDraftPoint(null);
    setTextInput('');
    setError('');
  }, [open, initialDrawing]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        if (textDraftPoint) setTextDraftPoint(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, textDraftPoint, onClose]);

  if (!open) return null;

  const getNormalizedPoint = (clientX: number, clientY: number): DrawingPoint => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return {
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || showOriginalOnly) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const pt = getNormalizedPoint(event.clientX, event.clientY);

    if (tool === 'text') {
      event.preventDefault();
      setTextDraftPoint(pt);
      setTextInput('');
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (tool === 'pen') {
      setDraftStroke({ id, tool: 'pen', color, width: 0.006, points: [pt] });
    } else {
      setDraftStroke({ id, tool, color, width: 0.006, start: pt, end: pt });
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId || !draftStroke) return;
    event.preventDefault();
    const pt = getNormalizedPoint(event.clientX, event.clientY);

    if (draftStroke.tool === 'pen') {
      const prevPoints = draftStroke.points || [];
      const last = prevPoints[prevPoints.length - 1];
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.003) return;
      if (prevPoints.length >= 900) return;
      setDraftStroke({ ...draftStroke, points: [...prevPoints, pt] });
    } else {
      setDraftStroke({ ...draftStroke, end: pt });
    }
  };

  const finishStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* Pointer capture may already be released */ }

    if (!draftStroke) return;
    const finalStroke = draftStroke;
    setDraftStroke(null);

    if (finalStroke.tool === 'arrow' || finalStroke.tool === 'circle') {
      const dx = (finalStroke.end?.x || 0) - (finalStroke.start?.x || 0);
      const dy = (finalStroke.end?.y || 0) - (finalStroke.start?.y || 0);
      if (Math.hypot(dx, dy) < 0.01) return;
    }
    setStrokes((prev) => [...prev.slice(-149), finalStroke]);
  };

  const handleConfirmText = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed || !textDraftPoint) return;
    setStrokes((prev) => [
      ...prev.slice(-149),
      {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tool: 'text',
        color,
        width: 0.006,
        start: textDraftPoint,
        text: trimmed.slice(0, 180),
      },
    ]);
    setTextDraftPoint(null);
    setTextInput('');
  };

  const handleSave = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ version: 1, strokes });
      onClose();
    } catch (err: any) {
      setError(err?.message || translateText('Não foi possível salvar as anotações.'));
    } finally {
      setSaving(false);
    }
  };

  const displayedOverlay: DrawingOverlayData | null = showOriginalOnly
    ? null
    : {
        version: 1,
        strokes: draftStroke ? [...strokes, draftStroke] : strokes,
      };

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-slate-950/92 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={translateText(title)}
    >
      {/* Top toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{translateText(title)}</h3>
          <p className="text-[11px] text-slate-400">
            {readOnly
              ? translateText('Visualização com camada de anotação separada da imagem original.')
              : translateText('A imagem original permanece intacta; apenas os traços são salvos por cima.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowOriginalOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              showOriginalOnly
                ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {showOriginalOnly ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{showOriginalOnly ? translateText('Mostrar desenho') : translateText('Só original')}</span>
          </button>

          {!readOnly && onSave && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFAA00] px-3 py-1.5 text-xs font-semibold text-[#151C25] transition hover:bg-amber-300 disabled:opacity-50"
            >
              <Save size={14} />
              <span>{saving ? translateText('Salvando…') : translateText('Salvar desenho')}</span>
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label={translateText('Fechar')}
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Drawing tools bar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
            {(
              [
                { id: 'pen', label: 'Caneta', Icon: PenLine },
                { id: 'arrow', label: 'Seta', Icon: ArrowUpRight },
                { id: 'circle', label: 'Círculo', Icon: Circle },
                { id: 'text', label: 'Texto', Icon: Type },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTool(id);
                  setShowOriginalOnly(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                  tool === id ? 'bg-[#FFAA00] text-[#151C25]' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Icon size={14} />
                <span>{translateText(label)}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5">
            {PALETTE.map((item) => (
              <button
                key={item.hex}
                type="button"
                aria-label={translateText(item.label)}
                title={translateText(item.label)}
                onClick={() => setColor(item.hex)}
                style={{ backgroundColor: item.hex }}
                className={`h-5 w-5 rounded-full border-2 transition-transform ${
                  color === item.hex ? 'scale-110 border-white ring-2 ring-amber-400/60' : 'border-slate-600'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!strokes.length || saving}
              onClick={() => setStrokes((prev) => prev.slice(0, -1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              <RotateCcw size={13} />
              <span>{translateText('Desfazer')}</span>
            </button>
            <button
              type="button"
              disabled={!strokes.length || saving}
              onClick={() => setStrokes([])}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-950/50 disabled:opacity-40"
            >
              <Trash2 size={13} />
              <span>{translateText('Limpar')}</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="bg-rose-900/90 px-4 py-2 text-center text-xs text-rose-100">
          {error}
        </div>
      )}

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6">
        <div
          ref={stageRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          style={{ touchAction: readOnly ? 'auto' : 'none' }}
          className={`relative inline-block max-h-full max-w-full select-none overflow-hidden rounded-lg border border-slate-700 bg-black shadow-2xl ${
            readOnly || showOriginalOnly ? 'cursor-default' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'
          }`}
        >
          <img
            src={imageUrl}
            alt={translateText('Print anexado')}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
              }
            }}
            className="block max-h-[76dvh] max-w-[94vw] object-contain"
          />
          <DrawingOverlaySvg
            drawingData={displayedOverlay}
            aspectWidth={naturalSize.w}
            aspectHeight={naturalSize.h}
          />

          {textDraftPoint && !readOnly && (
            <form
              onSubmit={handleConfirmText}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute inset-x-3 bottom-3 z-20 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-amber-400/60 bg-slate-900/95 p-2 shadow-xl"
            >
              <input
                autoFocus
                value={textInput}
                maxLength={180}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={translateText('Digite o texto da seta/marcação…')}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                className="rounded-lg bg-[#FFAA00] px-3 py-1.5 text-xs font-semibold text-[#151C25] disabled:opacity-40"
              >
                {translateText('Inserir')}
              </button>
              <button
                type="button"
                onClick={() => setTextDraftPoint(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X size={15} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
