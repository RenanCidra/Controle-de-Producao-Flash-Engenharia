import React from 'react';
import type { DrawingOverlayData, DrawingStroke } from '../api.ts';

interface DrawingOverlaySvgProps {
  drawingData?: DrawingOverlayData | null;
  aspectWidth?: number;
  aspectHeight?: number;
  className?: string;
}

function renderStroke(stroke: DrawingStroke, w: number, h: number) {
  const strokePx = Math.max(2, stroke.width * Math.min(w, h));
  const color = stroke.color || '#EF4444';

  if (stroke.tool === 'pen' && stroke.points?.length) {
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      return (
        <circle
          key={stroke.id}
          cx={p.x * w}
          cy={p.y * h}
          r={strokePx / 2}
          fill={color}
        />
      );
    }
    const d = stroke.points
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${(pt.x * w).toFixed(1)} ${(pt.y * h).toFixed(1)}`)
      .join(' ');
    return (
      <path
        key={stroke.id}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokePx}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (stroke.tool === 'arrow' && stroke.start && stroke.end) {
    const x1 = stroke.start.x * w;
    const y1 = stroke.start.y * h;
    const x2 = stroke.end.x * w;
    const y2 = stroke.end.y * h;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(14, strokePx * 3.8);
    const hx1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
    const hy1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
    const hx2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
    const hy2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
    return (
      <g key={stroke.id}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={strokePx}
          strokeLinecap="round"
        />
        <polyline
          points={`${hx1.toFixed(1)},${hy1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${hx2.toFixed(1)},${hy2.toFixed(1)}`}
          fill="none"
          stroke={color}
          strokeWidth={strokePx}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  if (stroke.tool === 'circle' && stroke.start && stroke.end) {
    const cx = ((stroke.start.x + stroke.end.x) / 2) * w;
    const cy = ((stroke.start.y + stroke.end.y) / 2) * h;
    const rx = Math.max(4, Math.abs(stroke.end.x - stroke.start.x) * w * 0.5);
    const ry = Math.max(4, Math.abs(stroke.end.y - stroke.start.y) * h * 0.5);
    return (
      <ellipse
        key={stroke.id}
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={color}
        strokeWidth={strokePx}
      />
    );
  }

  if (stroke.tool === 'text' && stroke.start && stroke.text) {
    const x = stroke.start.x * w;
    const y = stroke.start.y * h;
    const fontSize = Math.max(16, Math.round(Math.min(w, h) * 0.036));
    const approxW = Math.min(w - x - 8, Math.max(48, stroke.text.length * fontSize * 0.58 + 16));
    const boxH = fontSize + 10;
    return (
      <g key={stroke.id}>
        <rect
          x={Math.max(4, x - 6)}
          y={Math.max(4, y - fontSize - 2)}
          width={Math.max(40, approxW)}
          height={boxH}
          rx={6}
          fill="rgba(15, 23, 42, 0.82)"
          stroke={color}
          strokeWidth={1.5}
        />
        <text
          x={Math.max(10, x)}
          y={Math.max(fontSize + 2, y)}
          fill={color}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {stroke.text}
        </text>
      </g>
    );
  }

  return null;
}

export const DrawingOverlaySvg: React.FC<DrawingOverlaySvgProps> = ({
  drawingData,
  aspectWidth = 1000,
  aspectHeight = 750,
  className = '',
}) => {
  const strokes = drawingData?.strokes || [];
  if (!strokes.length) return null;

  const w = Math.max(100, aspectWidth || 1000);
  const h = Math.max(100, aspectHeight || 750);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    >
      {strokes.map((stroke) => renderStroke(stroke, w, h))}
    </svg>
  );
};
