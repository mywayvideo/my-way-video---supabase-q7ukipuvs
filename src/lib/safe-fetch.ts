export class SafeFetchError extends Error {
  status: number
  statusText: string

  constructor(message: string, status: number, statusText: string) {
    super(message)
    this.name = 'SafeFetchError'
    this.status = status
    this.statusText = statusText
  }
}

export async function safeJsonResponse<T = any>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as T
    } catch {
      throw new SafeFetchError(
        'Resposta JSON inválida do servidor.',
        response.status,
        response.statusText,
      )
    }
  }

  if (text.trim().startsWith('<') || contentType.includes('text/html')) {
    throw new SafeFetchError(
      'O servidor retornou uma página HTML em vez de JSON. O serviço pode estar temporariamente indisponível.',
      response.status,
      response.statusText,
    )
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new SafeFetchError(
      text.slice(0, 200) || 'Erro desconhecido do servidor.',
      response.status,
      response.statusText,
    )
  }
}
