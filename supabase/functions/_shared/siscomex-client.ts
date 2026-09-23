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

export interface TlsConnectivityResult {
  host: string
  reachable: boolean
  tlsVersion: string | null
  alpnProtocol: string | null
  error: string | null
  errorType: string | null
}

export interface DetailedError {
  errorType: string
  errorMessage: string
  errorProperties: Record<string, string>
}

export interface TlsDiagnostics {
  tlsVersion: string | null
  alpnProtocol: string | null
  forceTls12Attempted: boolean
  forceTls12Supported: boolean
  forceTls12Message: string
  handshakeError: string | null
  handshakeResult: string
  testD: boolean
  leafOnlyCert: boolean
}

export interface StartTlsDiagnostics {
  host: string
  tcpReachable: boolean
  tlsVersion: string | null
  alpnProtocol: string | null
  handshakeResult: string
  handshakeError: string | null
  errorType: string | null
  errorMessage: string | null
  forceTls12Attempted: boolean
  forceTls12Supported: boolean
  forceTls12Message: string
  startTlsOfferedMoreControl: boolean
  startTlsControlMessage: string
  authAttempted: boolean
  authResult: string | null
}

let cachedTokens: SiscomexTokens | null = null
let lastTlsDiagnostics: TlsDiagnostics | null = null

export function getLastTlsDiagnostics(): TlsDiagnostics | null {
  return lastTlsDiagnostics
}

function extractTlsVersion(handshakeInfo: any): string | null {
  if (!handshakeInfo) return null
  if (typeof handshakeInfo.tlsVersion === 'string') return handshakeInfo.tlsVersion
  if (typeof handshakeInfo.version === 'string') return handshakeInfo.version
  if (typeof handshakeInfo.protocol === 'string') return handshakeInfo.protocol
  const keys = Object.keys(handshakeInfo)
  for (const k of keys) {
    const v = handshakeInfo[k]
    if (typeof v === 'string' && /TLS/i.test(v)) return v
  }
  return null
}

function extractTlsVersionFromConn(conn: any): string | null {
  try {
    if (typeof conn.tlsVersion === 'string') return conn.tlsVersion
    if (typeof conn.protocolVersion === 'string') return conn.protocolVersion
    if (typeof conn.negotiatedVersion === 'string') return conn.negotiatedVersion
    if (typeof conn.getProtocol === 'function') {
      const proto = conn.getProtocol()
      if (typeof proto === 'string') return proto
    }
  } catch {
    /* noop */
  }
  return null
}

export function getSiscomexHost(): string {
  return Deno.env.get('SISCOMEX_ENV') === 'production' ? PROD_HOST : HOMOLOG_HOST
}

function detectKeyType(pemBlock: string): string {
  if (pemBlock.includes('RSA PRIVATE KEY')) return 'RSA'
  if (pemBlock.includes('EC PRIVATE KEY')) return 'EC'
  if (pemBlock.includes('ENCRYPTED PRIVATE KEY')) return 'Encrypted (PKCS#8)'
  if (pemBlock.includes('PRIVATE KEY')) return 'PKCS#8'
  if (pemBlock.includes('CERTIFICATE')) return 'Certificate'
  return 'Unknown'
}

export function extractErrorDetails(error: any): DetailedError {
  const errorType = error?.constructor?.name || error?.name || 'Unknown'
  const errorMessage = error?.message || String(error)
  const errorProperties: Record<string, string> = {}
  if (error) {
    const props = Object.getOwnPropertyNames(error)
    for (const prop of props) {
      if (prop === 'message' || prop === 'name' || prop === 'stack') continue
      try {
        const val = error[prop]
        errorProperties[prop] = typeof val === 'object' ? JSON.stringify(val) : String(val)
      } catch {
        /* noop */
      }
    }
    if (error.cause !== undefined) {
      try {
        errorProperties.cause =
          typeof error.cause === 'object'
            ? JSON.stringify(error.cause, Object.getOwnPropertyNames(error.cause))
            : String(error.cause)
      } catch {
        errorProperties.cause = String(error.cause)
      }
    }
    if (error.stack) {
      errorProperties.stack = String(error.stack)
    }
  }
  return { errorType, errorMessage, errorProperties }
}

export function splitPem(combined: string): { cert: string; key: string; leafCert: string } {
  const certMatches = combined.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  )
  const keyMatch = combined.match(
    /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/,
  )
  const cert = certMatches ? certMatches.join('\n') : ''

  console.log('[SISCOMEX DIAG] === CERT_PEM Extraction ===')
  console.log(
    `[SISCOMEX DIAG] Certificates found in chain: ${certMatches ? certMatches.length : 0}`,
  )
  if (certMatches) {
    certMatches.forEach((c, i) => {
      console.log(
        `[SISCOMEX DIAG]   Certificate ${i + 1}: ${c.length} chars, key type: ${detectKeyType(c)}`,
      )
    })
  }
  if (keyMatch) {
    console.log(
      `[SISCOMEX DIAG] Private key: ${keyMatch[0].length} chars, key type: ${detectKeyType(keyMatch[0])}`,
    )
  } else {
    console.log('[SISCOMEX DIAG] Private key: NOT FOUND')
  }
  console.log(`[SISCOMEX DIAG] Combined cert output: ${cert.length} chars`)

  function pemToDer(pem: string): Uint8Array {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  interface Asn1Node {
    tag: number
    value: Uint8Array
    children: Asn1Node[]
  }

  function parseAsn1(d: Uint8Array, off: number): { node: Asn1Node; next: number } {
    const tag = d[off]
    let p = off + 1
    const lb = d[p]
    p++
    let len: number
    if (lb & 0x80) {
      const n = lb & 0x7f
      len = 0
      for (let i = 0; i < n; i++) len = (len << 8) | d[p + i]
      p += n
    } else {
      len = lb
    }
    const val = d.subarray(p, p + len)
    const ch: Asn1Node[] = []
    if (tag & 0x20) {
      let c = p
      while (c < p + len) {
        const r = parseAsn1(d, c)
        ch.push(r.node)
        c = r.next
      }
    }
    return { node: { tag, value: val, children: ch }, next: p + len }
  }

  function oidStr(b: Uint8Array): string {
    const parts: string[] = [`${Math.floor(b[0] / 40)}`, `${b[0] % 40}`]
    let i = 1
    while (i < b.length) {
      let v = 0
      do {
        v = (v << 7) | (b[i] & 0x7f)
        i++
      } while (i < b.length && b[i - 1] & 0x80)
      parts.push(`${v}`)
    }
    return parts.join('.')
  }

  function nameStr(n: Asn1Node): string {
    let cn = '',
      o = '',
      ou = ''
    for (const s of n.children) {
      for (const a of s.children) {
        const oid = oidStr(a.children[0].value)
        const v = new TextDecoder().decode(a.children[1].value)
        if (oid === '2.5.4.3') cn = v
        else if (oid === '2.5.4.10') o = v
        else if (oid === '2.5.4.11') ou += (ou ? '; ' : '') + v
      }
    }
    return `CN=${cn}, O=${o}, OU=${ou}`
  }

  function certType(subj: string): string {
    if (/\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(subj)) return 'PJ(CNPJ)'
    if (/\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(subj)) return 'PF(CPF)'
    return 'Unknown'
  }

  if (certMatches) {
    for (let i = 0; i < certMatches.length && i < 4; i++) {
      try {
        const der = pemToDer(certMatches[i])
        const { node: cs } = parseAsn1(der, 0)
        const tbs = cs.children[0]
        let idx = 0
        if (tbs.children[0].tag === 0xa0) idx = 1
        idx++
        idx++
        const issuer = nameStr(tbs.children[idx])
        idx++
        const valNode = tbs.children[idx]
        idx++
        const subject = nameStr(tbs.children[idx])
        idx++
        const nb = new TextDecoder().decode(valNode.children[0].value)
        const na = new TextDecoder().decode(valNode.children[1].value)
        const type = certType(subject)
        console.log(
          `[SISCOMEX DIAG] Certificate ${i + 1}: Subject=${subject}, Issuer=${issuer}, Valid=${nb} to ${na}, Type=${type}`,
        )
      } catch (e: any) {
        console.log(`[SISCOMEX DIAG] Certificate ${i + 1}: Parse failed - ${e?.message || e}`)
      }
    }
  }

  if (certMatches && certMatches.length > 0 && keyMatch) {
    try {
      const isEncrypted = keyMatch[0].includes('ENCRYPTED PRIVATE KEY')
      if (isEncrypted) {
        console.log('[SISCOMEX DIAG] Key pair match: SKIPPED (encrypted private key)')
      } else {
        const certDer = pemToDer(certMatches[0])
        const keyDer = pemToDer(keyMatch[0])
        const isPkcs1 = keyMatch[0].includes('RSA PRIVATE KEY')

        const { node: cs } = parseAsn1(certDer, 0)
        const tbs = cs.children[0]
        let idx = 0
        if (tbs.children[0].tag === 0xa0) idx = 1
        idx += 4
        idx++
        const spki = tbs.children[idx]
        const bitStr = spki.children[1]
        const pkDer = bitStr.value.subarray(1)
        const { node: rsaPub } = parseAsn1(pkDer, 0)
        const cMod = rsaPub.children[0].value
        const cExp = rsaPub.children[1].value

        const { node: ks } = parseAsn1(keyDer, 0)
        let pMod: Uint8Array, pExp: Uint8Array
        if (isPkcs1) {
          pMod = ks.children[1].value
          pExp = ks.children[2].value
        } else {
          const oct = ks.children[2].value
          const { node: rsaPriv } = parseAsn1(oct, 0)
          pMod = rsaPriv.children[1].value
          pExp = rsaPriv.children[2].value
        }

        const modOk = cMod.length === pMod.length && cMod.every((b, i) => b === pMod[i])
        const expOk = cExp.length === pExp.length && cExp.every((b, i) => b === pExp[i])
        console.log(`[SISCOMEX DIAG] Key pair match: ${modOk && expOk ? 'YES' : 'NO'}`)
      }
    } catch (e: any) {
      console.log(`[SISCOMEX DIAG] Key pair comparison failed: ${e?.message || e}`)
    }
  }

  console.log('[SISCOMEX DIAG] === End CERT_PEM Extraction ===')

  // Build properly ordered chain: leaf → intermediates, excluding root
  if (certMatches && certMatches.length > 1) {
    interface CertInfo {
      pem: string
      subject: string
      issuer: string
      isSelfSigned: boolean
    }
    const certInfos: CertInfo[] = []

    for (const pem of certMatches) {
      try {
        const der = pemToDer(pem)
        const { node: cs } = parseAsn1(der, 0)
        const tbs = cs.children[0]
        let idx = 0
        if (tbs.children[0].tag === 0xa0) idx = 1
        idx++
        idx++
        const issuer = nameStr(tbs.children[idx])
        idx++
        idx++
        const subject = nameStr(tbs.children[idx])
        certInfos.push({ pem, subject, issuer, isSelfSigned: subject === issuer })
      } catch {
        certInfos.push({ pem, subject: '', issuer: '', isSelfSigned: false })
      }
    }

    // Find leaf: cert whose subject is not the issuer of any other cert
    let leafIdx = certInfos.findIndex(
      (c) => !certInfos.some((o) => o !== c && o.issuer === c.subject && o.subject !== c.subject),
    )
    if (leafIdx === -1) leafIdx = 0

    // Build chain from leaf following issuer references, excluding self-signed root
    const orderedChain: string[] = []
    const used = new Set<number>()
    let currentIdx = leafIdx
    while (currentIdx !== -1 && !used.has(currentIdx)) {
      used.add(currentIdx)
      const current = certInfos[currentIdx]
      if (current.isSelfSigned) break
      orderedChain.push(current.pem)
      currentIdx = certInfos.findIndex((c, i) => !used.has(i) && c.subject === current.issuer)
    }

    if (orderedChain.length > 0) {
      console.log(`[SISCOMEX DIAG] Chain reordered (${orderedChain.length} certs, root excluded):`)
      orderedChain.forEach((pem, i) => {
        const info = certInfos.find((c) => c.pem === pem)
        console.log(`[SISCOMEX DIAG]   Chain position ${i + 1}: ${info?.subject || 'unknown'}`)
      })
      console.log('[SISCOMEX DIAG] === End CERT_PEM Extraction ===')
      return {
        cert: orderedChain.join('\n'),
        key: keyMatch?.[0] || '',
        leafCert: orderedChain[0] || certMatches?.[0] || '',
      }
    }
  }

  console.log('[SISCOMEX DIAG] === End CERT_PEM Extraction ===')
  return { cert, key: keyMatch?.[0] || '', leafCert: certMatches?.[0] || cert }
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
): Promise<{
  status: number
  headers: Record<string, string>
  body: string
  tlsInfo: TlsDiagnostics
}> {
  const certPem = Deno.env.get('CERT_PEM') ?? ''
  if (!certPem) throw new Error('CERT_PEM secret not configured')
  const { cert, key, leafCert } = splitPem(certPem)
  if (!cert || !key) {
    throw new Error('CERT_PEM format invalid: could not extract certificate and private key')
  }
  console.log(`[SISCOMEX DIAG] === Test D: Leaf-only certificate mTLS ===`)
  console.log(
    `[SISCOMEX DIAG] Test D: Using leaf-only certificate (excluding intermediate CA chain)`,
  )
  console.log(
    `[SISCOMEX DIAG] Test D: Full chain length: ${cert.length} chars, Leaf cert length: ${leafCert.length} chars`,
  )

  const tlsInfo: TlsDiagnostics = {
    tlsVersion: null,
    alpnProtocol: null,
    forceTls12Attempted: true,
    forceTls12Supported: false,
    forceTls12Message:
      'Deno runtime does not officially support forcing TLS version via connectTls options. The forceTls13:false option was attempted but may be silently ignored by the runtime.',
    handshakeError: null,
    handshakeResult: 'not_attempted',
    testD: true,
    leafOnlyCert: true,
  }

  let conn
  try {
    try {
      conn = await Deno.connectTls({
        hostname: host,
        port: 443,
        certChain: leafCert,
        privateKey: key,
        ...({ forceTls13: false } as Record<string, unknown>),
      })
      console.log(
        '[SISCOMEX DIAG] mTLS: Attempted forceTls13:false option (may be silently ignored by Deno runtime)',
      )
    } catch {
      console.log(
        '[SISCOMEX DIAG] mTLS: forceTls13:false option not accepted, falling back to default TLS negotiation',
      )
      conn = await Deno.connectTls({
        hostname: host,
        port: 443,
        certChain: leafCert,
        privateKey: key,
      })
    }

    try {
      const hsInfo = await conn.handshake()
      tlsInfo.alpnProtocol = hsInfo.alpnProtocol
      tlsInfo.tlsVersion = extractTlsVersion(hsInfo)
      tlsInfo.handshakeResult = 'success'
      console.log(`[SISCOMEX DIAG] mTLS handshake info: ${JSON.stringify(hsInfo)}`)
      console.log(
        `[SISCOMEX DIAG] mTLS negotiated TLS version: ${tlsInfo.tlsVersion || 'not exposed by Deno runtime'}`,
      )
      console.log(`[SISCOMEX DIAG] mTLS ALPN protocol: ${tlsInfo.alpnProtocol || 'none'}`)
      if (!tlsInfo.tlsVersion) {
        tlsInfo.tlsVersion = extractTlsVersionFromConn(conn)
        if (tlsInfo.tlsVersion)
          console.log(`[SISCOMEX DIAG] mTLS TLS version from conn property: ${tlsInfo.tlsVersion}`)
      }
    } catch (hsError: any) {
      tlsInfo.handshakeError = hsError?.message || String(hsError)
      tlsInfo.handshakeResult = 'handshake_info_unavailable'
      console.log(
        `[SISCOMEX DIAG] mTLS handshake() info not available: ${hsError?.message || hsError}`,
      )
      tlsInfo.tlsVersion = extractTlsVersionFromConn(conn)
    }

    lastTlsDiagnostics = tlsInfo
  } catch (tlsError: any) {
    const details = extractErrorDetails(tlsError)
    tlsInfo.handshakeError = details.errorMessage
    tlsInfo.handshakeResult = 'failure'
    lastTlsDiagnostics = tlsInfo
    console.error('[SISCOMEX DIAG] === TLS Handshake Failure (with client cert) ===')
    console.error(`[SISCOMEX DIAG] Host: ${host}`)
    console.error(`[SISCOMEX DIAG] Error type: ${details.errorType}`)
    console.error(`[SISCOMEX DIAG] Error message: ${details.errorMessage}`)
    console.error(`[SISCOMEX DIAG] Error properties: ${JSON.stringify(details.errorProperties)}`)
    console.error(
      `[SISCOMEX DIAG] TLS version at failure: ${tlsInfo.tlsVersion || 'not available'}`,
    )
    console.error(
      `[SISCOMEX DIAG] Force TLS 1.2 attempted: ${tlsInfo.forceTls12Attempted}, supported: ${tlsInfo.forceTls12Supported}`,
    )
    console.error(`[SISCOMEX DIAG] Force TLS 1.2 message: ${tlsInfo.forceTls12Message}`)
    console.error('[SISCOMEX DIAG] === End TLS Handshake Failure ===')
    const enriched = new Error(
      `TLS handshake failed (${details.errorType}): ${details.errorMessage}`,
    )
    ;(enriched as any).originalErrorType = details.errorType
    ;(enriched as any).originalErrorProperties = details.errorProperties
    ;(enriched as any).tlsInfo = tlsInfo
    throw enriched
  }

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
  return { status, headers: respHeaders, body: bodyPart, tlsInfo }
}

export async function testTlsConnectivity(host?: string): Promise<TlsConnectivityResult> {
  const h = host || getSiscomexHost()
  console.log(`[SISCOMEX DIAG] === TLS Connectivity Test (no client cert) ===`)
  console.log(`[SISCOMEX DIAG] Attempting plain TLS connection to ${h}:443`)
  try {
    const conn = await Deno.connectTls({ hostname: h, port: 443 })
    let tlsVersion: string | null = null
    let alpnProtocol: string | null = null
    try {
      const info = await conn.handshake()
      alpnProtocol = info.alpnProtocol
      tlsVersion = extractTlsVersion(info)
      console.log(`[SISCOMEX DIAG] Handshake info: ${JSON.stringify(info)}`)
      console.log(
        `[SISCOMEX DIAG] Extracted TLS version: ${tlsVersion || 'not available in handshake info'}`,
      )
      if (!tlsVersion) {
        tlsVersion = extractTlsVersionFromConn(conn)
        if (tlsVersion) console.log(`[SISCOMEX DIAG] TLS version from conn property: ${tlsVersion}`)
      }
    } catch (hsError: any) {
      console.log(`[SISCOMEX DIAG] handshake() info not available: ${hsError?.message || hsError}`)
      tlsVersion = extractTlsVersionFromConn(conn)
      if (tlsVersion) console.log(`[SISCOMEX DIAG] TLS version from conn property: ${tlsVersion}`)
    }
    try {
      conn.close()
    } catch {
      /* noop */
    }
    console.log(`[SISCOMEX DIAG] TLS connectivity test: SUCCESS - server is reachable`)
    console.log(`[SISCOMEX DIAG] TLS version: ${tlsVersion || 'not reported by runtime'}`)
    console.log(`[SISCOMEX DIAG] ALPN protocol: ${alpnProtocol || 'none'}`)
    console.log('[SISCOMEX DIAG] === End TLS Connectivity Test ===')
    return { host: h, reachable: true, tlsVersion, alpnProtocol, error: null, errorType: null }
  } catch (error: any) {
    const details = extractErrorDetails(error)
    console.error(`[SISCOMEX DIAG] TLS connectivity test: FAILED - server may be unreachable`)
    console.error(`[SISCOMEX DIAG] Error type: ${details.errorType}`)
    console.error(`[SISCOMEX DIAG] Error message: ${details.errorMessage}`)
    console.error(`[SISCOMEX DIAG] Error properties: ${JSON.stringify(details.errorProperties)}`)
    console.error('[SISCOMEX DIAG] === End TLS Connectivity Test ===')
    return {
      host: h,
      reachable: false,
      tlsVersion: null,
      alpnProtocol: null,
      error: details.errorMessage,
      errorType: details.errorType,
    }
  }
}

async function sendHttpRequestOverConn(
  conn: Deno.TlsConn,
  host: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
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
    if (idx > 0) respHeaders[lines[i].substring(0, idx).toLowerCase()] = lines[i].substring(idx + 2)
  }
  if (respHeaders['transfer-encoding']?.includes('chunked')) bodyPart = dechunk(bodyPart)
  return { status, headers: respHeaders, body: bodyPart }
}

export async function testStartTlsMtls(host?: string): Promise<StartTlsDiagnostics> {
  const h = host || getSiscomexHost()
  console.log(`[SISCOMEX DIAG] === Test C: Raw TCP + startTls() mTLS ===`)

  const result: StartTlsDiagnostics = {
    host: h,
    tcpReachable: false,
    tlsVersion: null,
    alpnProtocol: null,
    handshakeResult: 'not_attempted',
    handshakeError: null,
    errorType: null,
    errorMessage: null,
    forceTls12Attempted: true,
    forceTls12Supported: false,
    forceTls12Message:
      'startTls() does not expose a forceTls12 or equivalent option in Deno runtime; TLS version negotiation is fully delegated to the runtime, same as connectTls().',
    startTlsOfferedMoreControl: false,
    startTlsControlMessage:
      'startTls() upgrades a raw TCP connection to TLS but does not expose additional TLS version control beyond connectTls(). The Deno runtime does not provide options to force TLS 1.2 via either API.',
    authAttempted: false,
    authResult: null,
  }

  let tcpConn
  try {
    tcpConn = await Deno.connect({ hostname: h, port: 443 })
    result.tcpReachable = true
    console.log(`[SISCOMEX DIAG] Test C: Raw TCP connection to ${h}:443 established`)
  } catch (tcpError: any) {
    result.handshakeResult = 'tcp_connect_failed'
    result.errorType = tcpError?.constructor?.name || tcpError?.name || 'Unknown'
    result.errorMessage = tcpError?.message || String(tcpError)
    result.handshakeError = result.errorMessage
    console.error(`[SISCOMEX DIAG] Test C: Raw TCP connection failed: ${result.errorMessage}`)
    console.log('[SISCOMEX DIAG] === End Test C ===')
    return result
  }

  const certPem = Deno.env.get('CERT_PEM') ?? ''
  let cert = ''
  let key = ''
  if (certPem) {
    const split = splitPem(certPem)
    cert = split.cert
    key = split.key
  }

  let tlsConn
  try {
    const baseOpts: Record<string, unknown> = { hostname: h }
    if (cert && key) {
      baseOpts.certChain = cert
      baseOpts.privateKey = key
    }

    try {
      tlsConn = await tcpConn.startTls({
        ...baseOpts,
        ...({ forceTls13: false } as Record<string, unknown>),
      } as Record<string, unknown>)
      console.log('[SISCOMEX DIAG] Test C: Attempted forceTls13:false option with startTls()')
    } catch {
      console.log(
        '[SISCOMEX DIAG] Test C: forceTls13:false not accepted by startTls(), using default options',
      )
      tlsConn = await tcpConn.startTls(baseOpts as Record<string, unknown>)
    }

    try {
      const hsInfo = await tlsConn.handshake()
      result.alpnProtocol = hsInfo.alpnProtocol
      result.tlsVersion = extractTlsVersion(hsInfo)
      result.handshakeResult = 'success'
      console.log(`[SISCOMEX DIAG] Test C: startTls() handshake info: ${JSON.stringify(hsInfo)}`)
      console.log(
        `[SISCOMEX DIAG] Test C: negotiated TLS version: ${result.tlsVersion || 'not exposed by Deno runtime'}`,
      )
      console.log(`[SISCOMEX DIAG] Test C: ALPN protocol: ${result.alpnProtocol || 'none'}`)
      if (!result.tlsVersion) {
        result.tlsVersion = extractTlsVersionFromConn(tlsConn)
        if (result.tlsVersion)
          console.log(
            `[SISCOMEX DIAG] Test C: TLS version from conn property: ${result.tlsVersion}`,
          )
      }
    } catch (hsError: any) {
      result.handshakeResult = 'handshake_info_unavailable'
      result.handshakeError = hsError?.message || String(hsError)
      console.log(
        `[SISCOMEX DIAG] Test C: handshake() info not available: ${result.handshakeError}`,
      )
      result.tlsVersion = extractTlsVersionFromConn(tlsConn)
    }
  } catch (startTlsError: any) {
    result.handshakeResult = 'failure'
    const details = extractErrorDetails(startTlsError)
    result.errorType = details.errorType
    result.errorMessage = details.errorMessage
    result.handshakeError = details.errorMessage
    console.error('[SISCOMEX DIAG] === Test C: startTls() Handshake Failure ===')
    console.error(`[SISCOMEX DIAG] Error type: ${details.errorType}`)
    console.error(`[SISCOMEX DIAG] Error message: ${details.errorMessage}`)
    console.error(`[SISCOMEX DIAG] Error properties: ${JSON.stringify(details.errorProperties)}`)
    console.error('[SISCOMEX DIAG] === End Test C Failure ===')
    try {
      tcpConn.close()
    } catch {
      /* noop */
    }
    return result
  }

  result.authAttempted = true
  try {
    const authResp = await sendHttpRequestOverConn(tlsConn, h, 'POST', '/portal/api/autenticar', {
      'Role-Type': 'IMPEXP',
      CNPJ: CNPJ,
      Accept: 'application/json',
      client_id: Deno.env.get('CLIENT_ID') ?? '',
      client_secret: Deno.env.get('CLIENT_SECRET') ?? '',
    })

    if (authResp.status === 200 || authResp.status === 201) {
      result.authResult = 'success'
      console.log(`[SISCOMEX DIAG] Test C: startTls() auth succeeded (status ${authResp.status})`)
    } else {
      result.authResult = `http_${authResp.status}`
      result.errorMessage = `Auth failed (${authResp.status}): ${authResp.body.substring(0, 300)}`
      console.error(`[SISCOMEX DIAG] Test C: startTls() auth failed (status ${authResp.status})`)
    }
  } catch (authError: any) {
    result.authResult = 'failure'
    const details = extractErrorDetails(authError)
    if (!result.errorType) result.errorType = details.errorType
    if (!result.errorMessage) result.errorMessage = details.errorMessage
    console.error(`[SISCOMEX DIAG] Test C: startTls() auth request failed: ${details.errorMessage}`)
  } finally {
    try {
      tlsConn.close()
    } catch {
      /* noop */
    }
  }

  console.log('[SISCOMEX DIAG] === End Test C ===')
  return result
}

export async function authenticate(host?: string): Promise<SiscomexTokens> {
  const h = host || getSiscomexHost()
  const resp = await tlsRequest(h, 'POST', '/portal/api/autenticar', {
    'Role-Type': 'IMPEXP',
    CNPJ: CNPJ,
    Accept: 'application/json',
    client_id: Deno.env.get('CLIENT_ID') ?? '',
    client_secret: Deno.env.get('CLIENT_SECRET') ?? '',
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
  lastTlsDiagnostics = resp.tlsInfo
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
