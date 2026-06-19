export type PaymentMethod =
  | 'stripe'
  | 'transferencia_miami'
  | 'zelle'
  | 'paypal'
  | 'pix'
  | 'transferencia_brasil'

export interface BankDetails {
  bankName: string
  accountNumber: string
  routingNumber?: string
  agencyNumber?: string
  accountHolder: string
  swiftCode?: string
  cpfCnpj?: string
}

export interface PIXData {
  pixKey: string
  qrCodeUrl: string
}

export interface ZelleData {
  email: string
}

export interface CustomerData {
  nome: string
  email: string
  telefone?: string
}
