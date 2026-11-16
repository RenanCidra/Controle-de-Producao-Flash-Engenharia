import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MediaValidationError,
  detectImageMimeFromMagicBytes,
  validateDrawingData,
  validateImageUpload,
} from './private-storage.ts';

test('detectImageMimeFromMagicBytes detects PNG, JPEG, and WebP and rejects SVG/text', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert.deepEqual(detectImageMimeFromMagicBytes(pngHeader), { mimeType: 'image/png', extension: 'png' });

  const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.deepEqual(detectImageMimeFromMagicBytes(jpgHeader), { mimeType: 'image/jpeg', extension: 'jpg' });

  const webpHeader = Buffer.from('RIFF1234WEBP', 'ascii');
  assert.deepEqual(detectImageMimeFromMagicBytes(webpHeader), { mimeType: 'image/webp', extension: 'webp' });

  const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(detectImageMimeFromMagicBytes(svgPayload), null);
  assert.throws(() => validateImageUpload(svgPayload, 'image/svg+xml'), MediaValidationError);
});

test('validateImageUpload rejects files over 5 MB', () => {
  const bigPng = Buffer.alloc(5 * 1024 * 1024 + 1);
  bigPng[0] = 0x89;
  bigPng[1] = 0x50;
  bigPng[2] = 0x4e;
  bigPng[3] = 0x47;
  bigPng[4] = 0x0d;
  bigPng[5] = 0x0a;
  bigPng[6] = 0x1a;
  bigPng[7] = 0x0a;
  assert.throws(() => validateImageUpload(bigPng, 'image/png'), MediaValidationError);
});

test('validateDrawingData sanitizes pen, arrow, circle, and text strokes and rejects invalid data', () => {
  const valid = validateDrawingData({
    version: 1,
    strokes: [
      { id: 's1', tool: 'pen', color: '#ffaa00', width: 0.005, points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }] },
      { id: 's2', tool: 'arrow', color: '#ef4444', width: 0.006, start: { x: 0.2, y: 0.2 }, end: { x: 0.8, y: 0.7 } },
      { id: 's3', tool: 'circle', color: '#0ea5e9', width: 0.005, start: { x: 0.3, y: 0.3 }, end: { x: 0.5, y: 0.5 } },
      { id: 's4', tool: 'text', color: '#ef4444', width: 0.005, start: { x: 0.25, y: 0.75 }, text: 'Falta saldo aqui' },
    ],
  });

  assert.equal(valid.version, 1);
  assert.equal(valid.strokes.length, 4);
  assert.equal(valid.strokes[0].color, '#FFAA00');
  assert.equal(valid.strokes[3].text, 'Falta saldo aqui');

  assert.throws(
    () => validateDrawingData({ version: 1, strokes: [{ tool: 'text', start: { x: 0.5, y: 0.5 }, text: '' }] }),
    MediaValidationError,
  );
  assert.throws(
    () => validateDrawingData({ version: 1, strokes: [{ tool: 'script', start: { x: 0.5, y: 0.5 } }] }),
    MediaValidationError,
  );
});
