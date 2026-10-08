/**
 * Validação dos campos que chegam dos formulários do painel.
 *
 * Vive fora de content.js porque notícias, vídeos e programação precisam das
 * mesmas regras — e porque o erro que elas levantam é o que vira a mensagem
 * que o responsável lê na tela.
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

export function requireText(value, field, { max = 500 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw new ValidationError(`O campo "${field}" é obrigatório.`);
  if (text.length > max) throw new ValidationError(`O campo "${field}" excede ${max} caracteres.`);
  return text;
}

export function optionalText(value, { max = 2000 } = {}) {
  return String(value ?? '').trim().slice(0, max);
}

/** Só aceita http/https — evita `javascript:` e afins vindos do formulário. */
export function requireHttpUrl(value, field) {
  const text = requireText(value, field, { max: 1000 });
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ValidationError(`O campo "${field}" precisa ser um endereço válido (https://...).`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`O campo "${field}" precisa começar com http:// ou https://`);
  }
  return url.toString();
}

export function optionalHttpUrl(value, field) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return requireHttpUrl(text, field);
}

export function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'on' || value === 'true' ? 1 : 0;
}
