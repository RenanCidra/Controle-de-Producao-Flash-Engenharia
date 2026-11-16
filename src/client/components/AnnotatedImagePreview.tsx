import React, { useEffect, useState } from 'react';
import { LoaderCircle, Maximize2, PenTool, RefreshCw } from 'lucide-react';
import type { DrawingOverlayData } from '../api.ts';
import { translateText } from '../i18n/index.ts';
import { DrawingOverlaySvg } from './DrawingOverlaySvg.tsx';
import { ImageAnnotationModal } from './ImageAnnotationModal.tsx';

interface AnnotatedImagePreviewProps {
  cacheKey?: string | number;
  loadImageUrl: () => Promise<string>;
  drawingData?: DrawingOverlayData | null;
  canDraw?: boolean;
  onSaveDrawing?: (drawingData: DrawingOverlayData) => Promise<void>;
  caption?: string;
}

export const AnnotatedImagePreview: React.FC<AnnotatedImagePreviewProps> = ({
  cacheKey,
  loadImageUrl,
  drawingData,
  canDraw = false,
  onSaveDrawing,
  caption,
}) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 1000, h: 750 });
  const loaderRef = React.useRef(loadImageUrl);
  loaderRef.current = loadImageUrl;

  const fetchImage = async () => {
    setLoading(true);
    setError(false);
    try {
      const nextUrl = await loaderRef.current();
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextUrl;
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    loaderRef.current()
      .then((nextUrl) => {
        if (!active) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cacheKey]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const strokeCount = drawingData?.strokes?.length || 0;

  if (loading && !url) {
    return (
      <div className="flex h-36 w-56 items-center justify-center rounded-lg border border-[#DCE3EB] bg-[#F8FAFC] text-xs text-slate-500">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#C27803]" />
        {translateText('Carregando imagem…')}
      </div>
    );
  }

  if (error || !url) {
    return (
      <button
        type="button"
        onClick={() => void fetchImage()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3EB] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#263548] hover:bg-slate-100"
      >
        <RefreshCw size={13} />
        {translateText('Recarregar imagem')}
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="group/img relative inline-block max-w-full overflow-hidden rounded-lg border border-[#DCE3EB] bg-slate-950">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="relative block max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          title={canDraw ? translateText('Abrir para visualizar ou desenhar') : translateText('Ampliar imagem')}
        >
          <img
            src={url}
            alt={caption || translateText('Imagem anexada')}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
              }
            }}
            className="block max-h-64 max-w-full object-contain sm:max-w-xs"
          />
          <DrawingOverlaySvg
            drawingData={drawingData}
            aspectWidth={naturalSize.w}
            aspectHeight={naturalSize.h}
          />
        </button>

        <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-[11px] text-slate-200">
          <span className="truncate">
            {strokeCount > 0
              ? `${strokeCount} ${translateText(strokeCount === 1 ? 'anotação' : 'anotações')}`
              : translateText('Print original')}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-700"
            >
              {canDraw ? <PenTool size={11} /> : <Maximize2 size={11} />}
              <span>{canDraw ? translateText('Desenhar') : translateText('Ampliar')}</span>
            </button>
          </div>
        </div>
      </div>

      <ImageAnnotationModal
        open={modalOpen}
        imageUrl={url}
        initialDrawing={drawingData}
        readOnly={!canDraw || !onSaveDrawing}
        title={canDraw ? 'Desenhar sobre imagem' : 'Visualizar imagem'}
        onClose={() => setModalOpen(false)}
        onSave={onSaveDrawing}
      />
    </div>
  );
};
