// Geração e validação de senhas definidas pelo admin.
// Regras: mínimo 12 caracteres, com maiúsculas, minúsculas, números e símbolos.

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%&*?-_+='
const ALL = UPPER + LOWER + DIGITS + SYMBOLS

export const PASSWORD_MIN_LENGTH = 12

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

function pick(chars: string): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return chars[buf[0] % chars.length]
}

// Gera uma senha de 16 caracteres garantindo ao menos um de cada classe.
export function generateStrongPassword(length = 16): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < length) chars.push(pick(ALL))
  // Embaralha (Fisher-Yates) para não deixar as classes sempre no início.
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    const j = buf[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
