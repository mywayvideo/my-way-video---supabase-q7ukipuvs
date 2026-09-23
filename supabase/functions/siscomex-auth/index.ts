import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticate,
  getSiscomexHost,
  testTlsConnectivity,
  testStartTlsMtls,
  extractErrorDetails,
  getLastTlsDiagnostics,
  splitPem,
} from '../_shared/siscomex-client.ts'

async function testSiscomexFetch(): Promise<Record<string, unknown>> {
  const HOMOLOG_HOST = 'val.portalunico.siscomex.gov.br'
  const CNPJ = '09196543000109'
  const authUrl = `https://${HOMOLOG_HOST}/portal/api/autenticar`

  const apiAvailable = typeof (Deno as any).createHttpClient === 'function'
  console.log(
    `[SISCOMEX DIAG] Test E: Deno.createHttpClient availability: ${apiAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`,
  )

  if (!apiAvailable) {
    const errMsg = 'Deno.createHttpClient is not a function'
    console.log(`[SISCOMEX DIAG] Test E: API unavailable - ${errMsg}`)
    return {
      testName: 'Test E',
      apiAvailable: false,
      apiError: errMsg,
      clientCreated: false,
      fetchAttempted: false,
      result: 'api_unavailable',
      message:
        'Deno.createHttpClient is not available in this Edge Function runtime. Test ended without attempting any workaround.',
    }
  }

  const certPem = Deno.env.get('CERT_PEM') ?? ''
  if (!certPem) {
    console.log('[SISCOMEX DIAG] Test E: CERT_PEM secret not configured')
    return {
      testName: 'Test E',
      apiAvailable: true,
      clientCreated: false,
      fetchAttempted: false,
      result: 'cert_not_configured',
      message: 'CERT_PEM secret is not configured.',
    }
  }

  const { cert, key } = splitPem(certPem)
  if (!cert || !key) {
    console.log(
      '[SISCOMEX DIAG] Test E: Could not extract certificate and/or private key from CERT_PEM',
    )
    return {
      testName: 'Test E',
      apiAvailable: true,
      clientCreated: false,
      fetchAttempted: false,
      result: 'cert_extraction_failed',
      message: 'Could not extract certificate and/or private key from CERT_PEM.',
    }
  }

  let client: any
  try {
    client = await (Deno as any).createHttpClient({
      certChain: cert,
      privateKey: key,
    })
    console.log('[SISCOMEX DIAG] Test E: HTTP client created successfully with mTLS certificate')
  } catch (clientError: any) {
    const errMsg = clientError?.message || String(clientError)
    console.error(`[SISCOMEX DIAG] Test E: Error creating HTTP client: ${errMsg}`)
    return {
      testName: 'Test E',
      apiAvailable: true,
      clientCreated: false,
      clientCreationError: errMsg,
      fetchAttempted: false,
      result: 'client_creation_failed',
      message: `Failed to create HTTP client: ${errMsg}`,
    }
  }

  console.log(`[SISCOMEX DIAG] Test E: Attempting fetch POST to ${authUrl}`)
  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Role-Type': 'IMPEXP',
        CNPJ: CNPJ,
        Accept: 'application/json',
        client_id: Deno.env.get('CLIENT_ID') ?? '',
        client_secret: Deno.env.get('CLIENT_SECRET') ?? '',
      },
      // @ts-ignore - client option is supported by Deno fetch when using createHttpClient
      client,
    })

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value: string, hdrKey: string) => {
      responseHeaders[hdrKey] = value
    })

    const responseBody = await response.text()

    console.log(`[SISCOMEX DIAG] Test E: HTTP status: ${response.status}`)
    console.log(`[SISCOMEX DIAG] Test E: Response headers: ${JSON.stringify(responseHeaders)}`)
    console.log(
      `[SISCOMEX DIAG] Test E: Response body (first 500 chars): ${responseBody.substring(0, 500)}`,
    )
    console.log('[SISCOMEX DIAG] Test E: SUCCESS - HTTP layer reached, TLS handshake completed')

    return {
      testName: 'Test E',
      apiAvailable: true,
      clientCreated: true,
      fetchAttempted: true,
      result: 'http_response_received',
      tlsHandshakeResult: 'success',
      httpStatus: response.status,
      responseHeaders,
      responseBody: responseBody.substring(0, 2000),
      message: `HTTP response received with status ${response.status}. TLS handshake completed successfully - the mTLS connection reached the HTTP layer.`,
    }
  } catch (fetchError: any) {
    const errorType = fetchError?.constructor?.name || fetchError?.name || 'Unknown'
    const errorMessage = fetchError?.message || String(fetchError)
    const isTlsError = /handshake|tls|ssl|certificate|cert/i.test(errorMessage)

    console.error(`[SISCOMEX DIAG] Test E: Fetch failed - Error type: ${errorType}`)
    console.error(`[SISCOMEX DIAG] Test E: Fetch failed - Error message: ${errorMessage}`)
    console.error(
      `[SISCOMEX DIAG] Test E: This appears to be a ${isTlsError ? 'TLS/HandshakeFailure' : 'non-TLS'} error`,
    )

    return {
      testName: 'Test E',
      apiAvailable: true,
      clientCreated: true,
      fetchAttempted: true,
      result: isTlsError ? 'tls_handshake_failure' : 'fetch_error',
      tlsHandshakeResult: isTlsError ? 'failure' : 'not_applicable',
      errorType,
      errorMessage,
      isTlsError,
      message: isTlsError
        ? `TLS HandshakeFailure occurred: ${errorMessage}. The mTLS/TLS incompatibility persists with Deno.createHttpClient.`
        : `Non-TLS error during fetch: ${errorMessage}`,
    }
  } finally {
    try {
      if (client && typeof client.close === 'function') {
        client.close()
      }
    } catch {
      /* noop */
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const diagnosticUrl = new URL(req.url)
  if (diagnosticUrl.searchParams.get('test') === 'e') {
    const testResult = await testSiscomexFetch()
    return new Response(JSON.stringify(testResult, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const host = getSiscomexHost()

    const connectivityTest = await testTlsConnectivity(host)
    const startTlsTest = await testStartTlsMtls(host)

    let tokens
    try {
      tokens = await authenticate(host)
    } catch (authError: any) {
      console.error('siscomex-auth auth error:', authError)
      const details = extractErrorDetails(authError)
      const mtlsTlsInfo = getLastTlsDiagnostics()

      return new Response(
        JSON.stringify({
          success: false,
          testD: true,
          leafOnlyCert: true,
          error: authError.message || 'Erro na autenticação Siscomex',
          errorType: details.errorType,
          errorMessage: details.errorMessage,
          connectivityTest: {
            host: connectivityTest.host,
            reachable: connectivityTest.reachable,
            tlsVersion: connectivityTest.tlsVersion,
          },
          mtlsTest: {
            tlsVersion: mtlsTlsInfo?.tlsVersion ?? null,
            handshakeResult: mtlsTlsInfo?.handshakeResult ?? 'failure',
            forceTls12Attempted: mtlsTlsInfo?.forceTls12Attempted ?? false,
            forceTls12Supported: mtlsTlsInfo?.forceTls12Supported ?? false,
            forceTls12Message: mtlsTlsInfo?.forceTls12Message ?? 'Not attempted',
            alpnProtocol: mtlsTlsInfo?.alpnProtocol ?? null,
            handshakeError: mtlsTlsInfo?.handshakeError ?? details.errorMessage,
            testD: mtlsTlsInfo?.testD ?? true,
            leafOnlyCert: mtlsTlsInfo?.leafOnlyCert ?? true,
          },
          startTlsTest,
          diagnostics: {
            errorType: details.errorType,
            errorMessage: details.errorMessage,
            errorProperties: details.errorProperties,
            tlsConnectivityTest: connectivityTest,
            mtlsTlsInfo,
            startTlsTest,
          },
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const mtlsTlsInfo = getLastTlsDiagnostics()

    return new Response(
      JSON.stringify({
        success: true,
        testD: true,
        leafOnlyCert: true,
        error: null,
        errorType: null,
        errorMessage: null,
        host,
        environment: Deno.env.get('SISCOMEX_ENV') || 'homolog',
        csrfExpiration: new Date(tokens.csrfExpiration).toISOString(),
        message: 'Autenticação mTLS realizada com sucesso via Portal Único Siscomex.',
        connectivityTest: {
          host: connectivityTest.host,
          reachable: connectivityTest.reachable,
          tlsVersion: connectivityTest.tlsVersion,
        },
        mtlsTest: {
          tlsVersion: mtlsTlsInfo?.tlsVersion ?? null,
          handshakeResult: mtlsTlsInfo?.handshakeResult ?? 'unknown',
          forceTls12Attempted: mtlsTlsInfo?.forceTls12Attempted ?? false,
          forceTls12Supported: mtlsTlsInfo?.forceTls12Supported ?? false,
          forceTls12Message: mtlsTlsInfo?.forceTls12Message ?? 'Not attempted',
          alpnProtocol: mtlsTlsInfo?.alpnProtocol ?? null,
          handshakeError: mtlsTlsInfo?.handshakeError ?? null,
          testD: mtlsTlsInfo?.testD ?? true,
          leafOnlyCert: mtlsTlsInfo?.leafOnlyCert ?? true,
        },
        startTlsTest,
        diagnostics: {
          tlsConnectivityTest: connectivityTest,
          mtlsTlsInfo,
          startTlsTest,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('siscomex-auth error:', error)
    const details = extractErrorDetails(error)
    const mtlsTlsInfo = getLastTlsDiagnostics()

    return new Response(
      JSON.stringify({
        success: false,
        testD: true,
        leafOnlyCert: true,
        error: error.message || 'Erro na autenticação Siscomex',
        errorType: details.errorType,
        errorMessage: details.errorMessage,
        connectivityTest: {
          host: getSiscomexHost(),
          reachable: false,
          tlsVersion: null,
        },
        startTlsTest: {
          host: getSiscomexHost(),
          tcpReachable: false,
          tlsVersion: null,
          alpnProtocol: null,
          handshakeResult: 'not_attempted',
          handshakeError: null,
          errorType: details.errorType,
          errorMessage: details.errorMessage,
          forceTls12Attempted: false,
          forceTls12Supported: false,
          forceTls12Message: 'Test C not reached due to earlier error',
          startTlsOfferedMoreControl: false,
          startTlsControlMessage: 'Test C not reached due to earlier error',
          authAttempted: false,
          authResult: null,
        },
        mtlsTest: {
          tlsVersion: mtlsTlsInfo?.tlsVersion ?? null,
          handshakeResult: mtlsTlsInfo?.handshakeResult ?? 'failure',
          forceTls12Attempted: mtlsTlsInfo?.forceTls12Attempted ?? false,
          forceTls12Supported: mtlsTlsInfo?.forceTls12Supported ?? false,
          forceTls12Message: mtlsTlsInfo?.forceTls12Message ?? 'Not attempted',
          alpnProtocol: mtlsTlsInfo?.alpnProtocol ?? null,
          handshakeError: mtlsTlsInfo?.handshakeError ?? details.errorMessage,
          testD: mtlsTlsInfo?.testD ?? true,
          leafOnlyCert: mtlsTlsInfo?.leafOnlyCert ?? true,
        },
        diagnostics: {
          errorType: details.errorType,
          errorMessage: details.errorMessage,
          errorProperties: details.errorProperties,
          mtlsTlsInfo,
        },
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
