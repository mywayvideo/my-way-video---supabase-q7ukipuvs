import { useState, useEffect, useCallback } from 'react'
import { CustomerAddress } from '@/types/customer'
import { customerService } from '@/services/customerService'
import { toast } from 'sonner'
import { ERROR_MESSAGES } from '@/constants/customer'

export function useAddressForm(customerId: string | undefined, type: 'shipping' | 'billing') {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchAddresses = useCallback(async () => {
    if (!customerId) return
    setIsLoading(true)
    try {
      const allAddresses = await customerService.getAddresses(customerId)
      setAddresses(allAddresses.filter((a) => a.address_type === type))
    } catch (err) {
      toast.error(ERROR_MESSAGES.network_error)
    } finally {
      setIsLoading(false)
    }
  }, [customerId, type])

  useEffect(() => {
    fetchAddresses()
  }, [fetchAddresses])

  const addAddress = async (
    address: Omit<CustomerAddress, 'id' | 'customer_id' | 'created_at' | 'updated_at'>,
  ) => {
    if (!customerId) return
    try {
      await customerService.addAddress({ ...address, customer_id: customerId })
      toast.success('Endereço adicionado com sucesso!')
      await fetchAddresses()
    } catch (err) {
      toast.error(ERROR_MESSAGES.network_error)
    }
  }

  const updateAddress = async (id: string, updates: Partial<CustomerAddress>) => {
    try {
      await customerService.updateAddress(id, updates)
      toast.success('Endereço atualizado com sucesso!')
      await fetchAddresses()
    } catch (err) {
      toast.error(ERROR_MESSAGES.network_error)
    }
  }

  const deleteAddress = async (id: string) => {
    try {
      await customerService.deleteAddress(id)
      toast.success('Endereço removido com sucesso!')
      await fetchAddresses()
    } catch (err) {
      toast.error(ERROR_MESSAGES.address_not_found)
    }
  }

  return { addresses, isLoading, addAddress, updateAddress, deleteAddress, fetchAddresses }
}
