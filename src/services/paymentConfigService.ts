import { supabase } from '@/lib/supabase/client'

const CONFIG_KEY = 'payment_methods_config'

const DEFAULT_CONFIG: Record<string, boolean> = {
  stripe: true,
  square: true,
  paypal: true,
  transferencia_miami: true,
  zelle: true,
  pix: true,
  transferencia_brasil: true,
}

export async function getPaymentMethodsConfig(): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', CONFIG_KEY)
    .maybeSingle()

  if (error || !data?.setting_value) return { ...DEFAULT_CONFIG }

  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(data.setting_value) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function savePaymentMethodsConfig(config: Record<string, boolean>): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { setting_key: CONFIG_KEY, setting_value: JSON.stringify(config) },
      { onConflict: 'setting_key' },
    )

  if (error) throw error
}

export interface PaymentMethodEntry {
  id: string
  label: string
  description: string
}

export const PAYMENT_METHOD_LABELS: PaymentMethodEntry[] = [
  { id: 'stripe', label: 'Stripe', description: 'Cartão de crédito via Stripe' },
  { id: 'square', label: 'Square', description: 'Cartão de crédito via Square' },
  { id: 'paypal', label: 'PayPal', description: 'Pagamento via PayPal' },
  {
    id: 'transferencia_miami',
    label: 'Transferência EUA',
    description: 'Transferência bancária em Miami (USD)',
  },
  { id: 'zelle', label: 'Zelle', description: 'Transferência via Zelle' },
  { id: 'pix', label: 'PIX', description: 'Pagamento instantâneo brasileiro' },
  {
    id: 'transferencia_brasil',
    label: 'Transferência Brasil',
    description: 'Transferência bancária no Brasil (BRL)',
  },
]
