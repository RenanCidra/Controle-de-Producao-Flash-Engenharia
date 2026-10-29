export function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidLoginName(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(value);
}

export function validateLoginName(value: string): string {
  const normalized = normalizeLoginName(value);
  if (!isValidLoginName(normalized)) {
    throw new Error('O usuário deve ter de 3 a 40 caracteres e usar apenas letras sem acento, números, ponto, hífen ou sublinhado.');
  }
  return normalized;
}

export function validatePassword(value: string): void {
  if (value.length < 12) {
    throw new Error('A senha deve possuir no mínimo 12 caracteres.');
  }
}
