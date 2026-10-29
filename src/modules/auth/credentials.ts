export function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Normaliza e padroniza identificadores de acesso (@login).
 * Remove acentos, converte espaços para pontos, remove caracteres especiais não permitidos
 * e formata em minúsculas de 3 a 40 caracteres.
 */
export function sanitizeLoginName(value: string): string {
  if (!value) return '';
  const sanitized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.') // substitui espaços por ponto
    .replace(/[^a-z0-9._-]/g, '') // aceita apenas caracteres válidos
    .replace(/\.{2,}/g, '.') // remove múltiplos pontos consecutivos
    .replace(/^[._-]+|[._-]+$/g, ''); // remove pontuações no início ou fim
  return sanitized.slice(0, 40);
}

/**
 * Padroniza nomes próprios e termos para formato Title Case (Primeira letra em maiúscula, restantes em minúsculas),
 * preservando preposições usuais em minúsculas (de, da, do, das, dos, e, em) a menos que iniciem o texto.
 */
export function formatProperName(value: string): string {
  if (!value) return '';
  const prepositions = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em']);
  const words = value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ');

  return words
    .map((word, index) => {
      if (!word) return '';
      const lower = word.toLowerCase();
      // Preposições no meio do nome permanecem em minúsculas
      if (index > 0 && prepositions.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function isValidLoginName(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(value);
}

export function validateLoginName(value: string): string {
  const sanitized = sanitizeLoginName(value);
  if (!isValidLoginName(sanitized)) {
    throw new Error('O usuário deve ter de 3 a 40 caracteres e usar apenas letras sem acento, números, ponto, hífen ou sublinhado.');
  }
  return sanitized;
}

export function validatePassword(value: string): void {
  if (value.length < 12) {
    throw new Error('A senha deve possuir no mínimo 12 caracteres.');
  }
  if (Buffer.byteLength(value, 'utf8') > 72) {
    throw new Error('A senha deve possuir no máximo 72 bytes.');
  }
}

