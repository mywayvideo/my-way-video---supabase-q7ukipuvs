import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuthContext } from '@/contexts/AuthContext'

export interface Customer {
  id: string
  user_id: string
  full_name: string | null
}

export function useCurrentCustomer() {
  const { currentUser } = useAuthContext()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCustomer() {
      if (!currentUser?.id) {
        setCustomer(null)
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('customers')
          .select('id, user_id, full_name')
          .eq('user_id', currentUser.id)
          .maybeSingle()

        if (error) throw error

        if (data) {
          setCustomer(data as Customer)
        } else {
          // Fallback if no customer record yet exists
          setCustomer({
            id: '',
            user_id: currentUser.id,
            full_name: currentUser.user_metadata?.name || null,
          })
        }
      } catch (error) {
        console.error('Error fetching customer:', error)
        // Fallback to user metadata so it doesn't break
        setCustomer({
          id: '',
          user_id: currentUser.id,
          full_name: currentUser.user_metadata?.name || null,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchCustomer()
  }, [currentUser])

  return { customer, loading }
}
