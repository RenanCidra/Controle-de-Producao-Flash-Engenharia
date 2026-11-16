import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import { communicationStorageBucket } from './communication-storage.ts';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LOCAL_PREFIX = 'local:';
const PRIVATE_LOCAL_ROOT = path.resolve(process.cwd(), '.private-storage');

export type DrawingTool = 'pen' | 'arrow' | 'circle' | 'text';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  points?: DrawingPoint[];
  start?: DrawingPoint;
  end?: DrawingPoint;
  text?: string;
}

export interface DrawingOverlayData {
  version: 1;
  strokes: DrawingStroke[];
  updatedAt?: string;
}

export class MediaValidationError extends Error {}

function sanitizeRelativeStoragePath(objectPath: string): string {
  const normalized = String(objectPath || '').trim().replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\\') || normalized.includes('\0')) {
    throw new MediaValidationError('Caminho de armazenamento inválido.');
  }
  return normalized;
}

function resolveLocalPath(objectPath: string): string {
  const rel = sanitizeRelativeStoragePath(objectPath.startsWith(LOCAL_PREFIX) ? objectPath.slice(LOCAL_PREFIX.length) : objectPath);
  const full = path.resolve(PRIVATE_LOCAL_ROOT, rel);
  if (!full.startsWith(`${PRIVATE_LOCAL_ROOT}${path.sep}`)) {
    throw new MediaValidationError('Caminho de arquivo fora da área privada.');
  }
  return full;
}

export function detectImageMimeFromMagicBytes(buffer: Buffer): { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; extension: 'png' | 'jpg' | 'webp' } | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
}

export function validateImageUpload(buffer: Buffer, declaredMimeType?: string | null) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new MediaValidationError('Imagem vazia ou inválida.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new MediaValidationError('A imagem excede o limite máximo de 5 MB.');
  }
  const detected = detectImageMimeFromMagicBytes(buffer);
  if (!detected) {
    throw new MediaValidationError('Formato de imagem inválido. Envie apenas PNG, JPEG ou WebP.');
  }
  const normalizedDeclared = String(declaredMimeType || '').split(';', 1)[0].trim().toLowerCase();
  if (normalizedDeclared && normalizedDeclared !== detected.mimeType && !(normalizedDeclared === 'image/jpg' && detected.mimeType === 'image/jpeg')) {
    throw new MediaValidationError('O tipo da imagem não corresponde ao conteúdo do arquivo.');
  }
  return detected;
}

function clampCoord(value: unknown, label: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < -0.02 || num > 1.02) {
    throw new MediaValidationError(`Coordenada inválida em ${label}.`);
  }
  return Math.min(1, Math.max(0, Math.round(num * 10000) / 10000));
}

function parsePoint(raw: unknown, label: string): DrawingPoint {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MediaValidationError(`Ponto inválido em ${label}.`);
  }
  const rec = raw as Record<string, unknown>;
  return {
    x: clampCoord(rec.x, `${label}.x`),
    y: clampCoord(rec.y, `${label}.y`),
  };
}

export function validateDrawingData(input: unknown): DrawingOverlayData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new MediaValidationError('Estrutura de desenho inválida.');
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.strokes)) {
    throw new MediaValidationError('Lista de traços do desenho é obrigatória.');
  }
  if (obj.strokes.length > 150) {
    throw new MediaValidationError('O desenho excedeu o limite máximo de 150 anotações.');
  }

  const strokes: DrawingStroke[] = obj.strokes.map((rawStroke, index) => {
    if (!rawStroke || typeof rawStroke !== 'object' || Array.isArray(rawStroke)) {
      throw new MediaValidationError(`Anotação #${index + 1} inválida.`);
    }
    const item = rawStroke as Record<string, unknown>;
    const tool = typeof item.tool === 'string' ? item.tool.trim() : '';
    if (!['pen', 'arrow', 'circle', 'text'].includes(tool)) {
      throw new MediaValidationError(`Ferramenta de desenho não suportada: ${tool || 'desconhecida'}.`);
    }
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 64) : `stroke-${index + 1}`;
    const color = typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color.trim())
      ? item.color.trim().toUpperCase()
      : '#EF4444';
    const rawWidth = Number(item.width ?? 0.005);
    if (!Number.isFinite(rawWidth) || rawWidth < 0.001 || rawWidth > 0.05) {
      throw new MediaValidationError('Espessura do traço inválida.');
    }
    const width = Math.round(rawWidth * 10000) / 10000;

    if (tool === 'pen') {
      if (!Array.isArray(item.points) || item.points.length < 1 || item.points.length > 1000) {
        throw new MediaValidationError('Traço livre de caneta inválido.');
      }
      return {
        id,
        tool: 'pen',
        color,
        width,
        points: item.points.map((pt, ptIdx) => parsePoint(pt, `pen[${index}].points[${ptIdx}]`)),
      };
    }

    if (tool === 'arrow' || tool === 'circle') {
      return {
        id,
        tool,
        color,
        width,
        start: parsePoint(item.start, `${tool}[${index}].start`),
        end: parsePoint(item.end, `${tool}[${index}].end`),
      };
    }

    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!text || text.length > 180) {
      throw new MediaValidationError('Texto da anotação deve ter entre 1 e 180 caracteres.');
    }
    return {
      id,
      tool: 'text',
      color,
      width,
      start: parsePoint(item.start, `text[${index}].start`),
      text,
    };
  });

  return {
    version: 1,
    strokes,
    updatedAt: new Date().toISOString(),
  };
}

export async function savePrivateFile(objectPath: string, buffer: Buffer, mimeType: string): Promise<string> {
  const cleanRel = sanitizeRelativeStoragePath(objectPath);
  const preferLocal = process.env.PRIVATE_STORAGE_MODE === 'local';

  if (!preferLocal) {
    try {
      const file = communicationStorageBucket().file(cleanRel);
      await file.save(buffer, {
        resumable: false,
        metadata: { contentType: mimeType, cacheControl: 'private, no-store' },
      });
      return cleanRel;
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      // Em desenvolvimento/preview sem credenciais GCS, armazena fora de public/ e dist/.
    }
  }

  const localFull = resolveLocalPath(cleanRel);
  await mkdir(path.dirname(localFull), { recursive: true });
  await writeFile(localFull, buffer);
  return `${LOCAL_PREFIX}${cleanRel}`;
}

export async function readPrivateFileBuffer(storedPath: string): Promise<Buffer> {
  if (storedPath.startsWith(LOCAL_PREFIX)) {
    return readFile(resolveLocalPath(storedPath));
  }
  try {
    const [buffer] = await communicationStorageBucket().file(sanitizeRelativeStoragePath(storedPath)).download();
    return buffer;
  } catch (error) {
    const localCandidate = resolveLocalPath(storedPath);
    return readFile(localCandidate).catch(() => {
      throw error;
    });
  }
}

export async function copyPrivateFile(sourceStoredPath: string, targetObjectPath: string, mimeType: string): Promise<string> {
  const cleanTarget = sanitizeRelativeStoragePath(targetObjectPath);
  if (sourceStoredPath.startsWith(LOCAL_PREFIX)) {
    const localSource = resolveLocalPath(sourceStoredPath);
    const localTarget = resolveLocalPath(cleanTarget);
    await mkdir(path.dirname(localTarget), { recursive: true });
    await copyFile(localSource, localTarget);
    return `${LOCAL_PREFIX}${cleanTarget}`;
  }
  const buffer = await readPrivateFileBuffer(sourceStoredPath);
  return savePrivateFile(cleanTarget, buffer, mimeType);
}

export async function deletePrivateFile(storedPath: string): Promise<void> {
  if (!storedPath) return;
  if (storedPath.startsWith(LOCAL_PREFIX)) {
    await unlink(resolveLocalPath(storedPath)).catch(() => undefined);
    return;
  }
  await communicationStorageBucket().file(sanitizeRelativeStoragePath(storedPath)).delete().catch(() => undefined);
}

export async function streamPrivateFile(
  storedPath: string,
  mimeType: string,
  filename: string,
  res: Response,
  onError: (error: unknown) => void,
) {
  try {
    if (storedPath.startsWith(LOCAL_PREFIX)) {
      const localFull = resolveLocalPath(storedPath);
      const info = await stat(localFull);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(info.size));
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const stream = createReadStream(localFull);
      stream.on('error', onError);
      stream.pipe(res);
      return;
    }

    const file = communicationStorageBucket().file(sanitizeRelativeStoragePath(storedPath));
    const [metadata] = await file.getMetadata();
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(metadata.size || 0));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = file.createReadStream();
    stream.on('error', onError);
    stream.pipe(res);
  } catch (error) {
    onError(error);
  }
}
