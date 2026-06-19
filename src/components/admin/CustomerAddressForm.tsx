import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase/client'

interface Props {
  type: 'shipping' | 'billing'
  address: any
  onChange: (type: 'shipping' | 'billing', address: any) => void
}

export function CustomerAddressForm({ type, address, onChange }: Props) {
  const data = address || {}

  const handleChange = (field: string, value: string) => {
    onChange(type, { ...data, [field]: value })
  }

  const handleZipLookup = async (zip: string) => {
    if (!zip || zip.length < 5) return
    try {
      const { data: res, error } = await supabase.functions.invoke('lookup-address', {
        body: { cep_or_zip: zip, country: data.country || 'Brasil' },
      })
      if (res && !error) {
        onChange(type, {
          ...data,
          zip_code: zip,
          street: res.street || data.street || '',
          neighborhood: res.neighborhood || data.neighborhood || '',
          city: res.city || data.city || '',
          state: res.state || data.state || '',
          country: res.country || data.country || 'Brasil',
        })
      }
    } catch (err) {
      console.error('Error looking up address:', err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>CEP / ZIP Code</Label>
        <Input
          value={data.zip_code || ''}
          onChange={(e) => handleChange('zip_code', e.target.value)}
          onBlur={(e) => handleZipLookup(e.target.value)}
          placeholder="Digite o CEP..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>País</Label>
          <Input
            value={data.country || 'Brasil'}
            onChange={(e) => handleChange('country', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <Input value={data.state || ''} onChange={(e) => handleChange('state', e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Cidade</Label>
        <Input value={data.city || ''} onChange={(e) => handleChange('city', e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Bairro</Label>
        <Input
          value={data.neighborhood || ''}
          onChange={(e) => handleChange('neighborhood', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Rua / Logradouro</Label>
        <Input value={data.street || ''} onChange={(e) => handleChange('street', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Número</Label>
          <Input
            value={data.number || ''}
            onChange={(e) => handleChange('number', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Complemento</Label>
          <Input
            value={data.complement || ''}
            onChange={(e) => handleChange('complement', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
