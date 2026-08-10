const HOMOLOG_HOST = 'val.portalunico.siscomex.gov.br'
const PROD_HOST = 'portalunico.siscomex.gov.br'
const CNPJ = '09196543000109'
const ORIGIN_COUNTRY = '840'
const MAX_TOKEN_AGE_MS = 60 * 60 * 1000

export interface SiscomexTokens {
  token: string
  csrfToken: string
  csrfExpiration: number
  fetchedAt: number
}

let cachedTokens: SiscomexTokens | null = null

export function getSiscomexHost(): string {
  return Deno.env.get('SISCOMEX_ENV') === 'production' ? PROD_HOST : HOMOLOG_HOST
}

function splitPem(combined: string): { cert: string; key: string } {
  const certMatch = combined.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)
  const keyMatch = combined.match(
    /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/,
  )
  return { cert: certMatch?.[0] || '', key: keyMatch?.[0] || '' }
}

function dechunk(body: string): string {
  let result = ''
  let pos = 0
  while (pos < body.length) {
    const eol = body.indexOf('\r\n', pos)
    if (eol === -1) break
    const size = parseInt(body.substring(pos, eol), 16)
    if (!size) break
    pos = eol + 2
    result += body.substring(pos, pos + size)
    pos += size + 2
  }
  return result
}

async function tlsRequest(
  host: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const certPem = Deno.env.get('CERT_PEM') ?? ''
  if (!certPem) throw new Error('CERT_PEM secret not configured')
  const { cert, key } = splitPem(certPem)
  if (!cert || !key) {
    throw new Error('CERT_PEM format invalid: could not extract certificate and private key')
  }

  const conn = await Deno.connectTls({
    hostname: host,
    port: 443,
    certChain: cert,
    privateKey: key,
  })

  let req = `${method} ${path} HTTP/1.1\r\nHost: ${host}\r\n`
  for (const [k, v] of Object.entries(headers)) req += `${k}: ${v}\r\n`
  if (body) req += `Content-Length: ${new TextEncoder().encode(body).length}\r\n`
  req += 'Connection: close\r\n\r\n'
  if (body) req += body

  const enc = new TextEncoder()
  const data = enc.encode(req)
  let written = 0
  while (written < data.length) {
    written += await conn.write(data.subarray(written))
  }

  const dec = new TextDecoder()
  let raw = ''
  const buf = new Uint8Array(16384)
  const timeout = setTimeout(() => {
    try {
      conn.close()
    } catch {
      /* noop */
    }
  }, 30000)
  try {
    while (true) {
      const n = await conn.read(buf)
      if (n === null) break
      raw += dec.decode(buf.subarray(0, n))
    }
  } finally {
    clearTimeout(timeout)
    try {
      conn.close()
    } catch {
      /* noop */
    }
  }

  const sep = raw.indexOf('\r\n\r\n')
  if (sep === -1) return { status: 0, headers: {}, body: raw }

  const hdrPart = raw.substring(0, sep)
  let bodyPart = raw.substring(sep + 4)
  const lines = hdrPart.split('\r\n')
  const status = parseInt(lines[0].split(' ')[1]) || 0
  const respHeaders: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(': ')
    if (idx > 0) {
      respHeaders[lines[i].substring(0, idx).toLowerCase()] = lines[i].substring(idx + 2)
    }
  }
  if (respHeaders['transfer-encoding']?.includes('chunked')) bodyPart = dechunk(bodyPart)
  return { status, headers: respHeaders, body: bodyPart }
}

export async function authenticate(host?: string): Promise<SiscomexTokens> {
  const h = host || getSiscomexHost()
  const resp = await tlsRequest(h, 'POST', '/portal/api/autenticar', {
    'Role-Type': 'IMPEXP',
    CNPJ: CNPJ,
    Accept: 'application/json',
  })

  if (resp.status !== 200 && resp.status !== 201) {
    throw new Error(`Auth failed (${resp.status}): ${resp.body.substring(0, 300)}`)
  }

  const token = resp.headers['set-token'] || ''
  const csrf = resp.headers['x-csrf-token'] || ''
  const expStr = resp.headers['x-csrf-expiration'] || ''
  if (!token) throw new Error('No Set-Token in auth response')
  if (!csrf) throw new Error('No X-CSRF-Token in auth response')

  let exp = Date.now() + MAX_TOKEN_AGE_MS
  if (expStr) {
    const parsed = new Date(expStr).getTime()
    if (!isNaN(parsed)) exp = parsed
  }

  cachedTokens = { token, csrfToken: csrf, csrfExpiration: exp, fetchedAt: Date.now() }
  return cachedTokens
}

export async function getValidTokens(host?: string): Promise<SiscomexTokens> {
  const now = Date.now()
  if (
    cachedTokens &&
    now < cachedTokens.csrfExpiration &&
    now - cachedTokens.fetchedAt < MAX_TOKEN_AGE_MS
  ) {
    return cachedTokens
  }
  return authenticate(host)
}

export async function queryTTCE(ncm: string, host?: string): Promise<any | null> {
  const h = host || getSiscomexHost()
  const normalized = ncm.replace(/\D/g, '').substring(0, 8)
  if (!normalized) return null

  const path = `/ttce/api/ext/tratamentos-tributarios/importacao/${normalized}?pais=${ORIGIN_COUNTRY}`

  for (let attempt = 0; attempt <= 2; attempt++) {
    const tokens = await getValidTokens(h)
    const resp = await tlsRequest(h, 'GET', path, {
      Token: tokens.token,
      'X-CSRF-Token': tokens.csrfToken,
      Accept: 'application/json',
    })

    if (resp.status === 401 || resp.status === 403) {
      cachedTokens = null
      continue
    }

    if (resp.status === 429 || resp.status === 503) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 3000))
        continue
      }
      return null
    }

    if (resp.status === 200) {
      try {
        return JSON.parse(resp.body)
      } catch {
        return null
      }
    }
    return null
  }
  return null
}
