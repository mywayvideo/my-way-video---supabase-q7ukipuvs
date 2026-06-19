import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface CustomerCSVImporterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CustomerCSVImporter({ open, onOpenChange, onSuccess }: CustomerCSVImporterProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Lightweight CSV parser to map file contents correctly
  const parseCSV = (str: string) => {
    const arr: string[][] = []
    let quote = false
    let row = 0,
      col = 0,
      c = 0
    for (; c < str.length; c++) {
      const cc = str[c],
        nc = str[c + 1]
      arr[row] = arr[row] || []
      arr[row][col] = arr[row][col] || ''
      if (cc === '"' && quote && nc === '"') {
        arr[row][col] += cc
        ++c
        continue
      }
      if (cc === '"') {
        quote = !quote
        continue
      }
      if (cc === ',' && !quote) {
        ++col
        continue
      }
      if (cc === '\r' && nc === '\n' && !quote) {
        ++row
        col = 0
        ++c
        continue
      }
      if (cc === '\n' && !quote) {
        ++row
        col = 0
        continue
      }
      if (cc === '\r' && !quote) {
        ++row
        col = 0
        continue
      }
      arr[row][col] += cc
    }
    if (arr.length > 0) {
      // Clean headers, removing BOM if exists
      const headers = arr[0].map((h) => h.replace(/^\uFEFF/, '').trim())
      return arr
        .slice(1)
        .filter((r) => r.some((cell) => cell?.trim()))
        .map((row) => {
          const obj: Record<string, string> = {}
          headers.forEach((h, i) => (obj[h] = row[i]?.trim() || ''))
          return obj
        })
    }
    return []
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setProgress(10)

    try {
      const text = await file.text()
      const rows = parseCSV(text)

      if (!rows || rows.length === 0) {
        throw new Error('Arquivo vazio ou formato inválido.')
      }

      setProgress(30)

      const batchSize = 50
      let processed = 0

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize)
        const payload = batch
          .map((row) => {
            const billing_address = {
              street: row['billing_address_1'] || row['Endereço 1'] || '',
              neighborhood: row['billing_address_2'] || row['Endereço 2'] || '',
              zip_code: row['billing_postcode'] || row['CEP'] || '',
              city: row['billing_city'] || row['Cidade'] || '',
              state: row['billing_state'] || row['Estado'] || '',
              country: row['billing_country'] || row['País'] || '',
            }

            const shipping_address = {
              street: row['shipping_address_1'] || billing_address.street,
              neighborhood: row['shipping_address_2'] || billing_address.neighborhood,
              zip_code: row['shipping_postcode'] || billing_address.zip_code,
              city: row['shipping_city'] || billing_address.city,
              state: row['shipping_state'] || billing_address.state,
              country: row['shipping_country'] || billing_address.country,
            }

            const firstName = row['billing_first_name'] || row['first_name'] || row['Nome'] || ''
            const lastName = row['billing_last_name'] || row['last_name'] || row['Sobrenome'] || ''
            let fullName = `${firstName} ${lastName}`.trim()
            if (!fullName) fullName = row['display_name'] || ''

            const email = (
              row['user_email'] ||
              row['billing_email'] ||
              row['Email'] ||
              ''
            ).toLowerCase()
            const phone = row['billing_phone'] || row['shipping_phone'] || row['Telefone'] || null

            return {
              full_name: fullName,
              email: email,
              phone: phone,
              billing_address,
              shipping_address,
              is_imported: true,
              has_migrated: false,
              status: 'ativo',
              role: 'customer',
            }
          })
          .filter((item) => item.email) // Email is required for upsert

        if (payload.length > 0) {
          const { error } = await supabase
            .from('customers')
            .upsert(payload, { onConflict: 'email' })
          if (error) throw error
        }

        processed += batch.length
        setProgress(30 + Math.floor((processed / rows.length) * 70))
      }

      toast({
        title: 'Sucesso',
        description: `Importação concluída com sucesso! ${processed} registros processados.`,
      })
      onSuccess()
      onOpenChange(false)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao processar arquivo. Verifique o formato CSV.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Clientes (CSV)</DialogTitle>
          <DialogDescription>
            Selecione um arquivo CSV exportado do WooCommerce ou no formato padrão para importar
            clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <Input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={loading}
          />
          {loading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground text-center">{progress}% concluído</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!file || loading}>
            {loading ? 'Importando...' : 'Iniciar Importação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
