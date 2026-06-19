import React, { createContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'

interface UserContextType {
  userName: string | null
  userEmail: string | null
  userPhone: string | null
  isLoading: boolean
  setUserData: (data: {
    userName: string | null
    userEmail: string | null
    userPhone: string | null
  }) => void
  clearUserData: () => void
}

export const UserContext = createContext<UserContextType | undefined>(undefined)

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userPhone, setUserPhone] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user) {
          setIsLoading(false)
          return
        }

        const { data: customerData, error: dbError } = await supabase
          .from('customers')
          .select('full_name, email, phone')
          .eq('user_id', user.id)
          .single()

        if (dbError) {
          console.error(dbError)
        } else if (customerData) {
          setUserName(
            customerData.full_name ||
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              null,
          )
          setUserEmail(customerData.email || user.email || null)
          setUserPhone(customerData.phone || null)
        } else {
          setUserName(user.user_metadata?.full_name || user.user_metadata?.name || null)
          setUserEmail(user.email || null)
        }
      } catch (error) {
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUserName(null)
        setUserEmail(null)
        setUserPhone(null)
      } else if (event === 'SIGNED_IN') {
        fetchUserData()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const setUserData = (data: {
    userName: string | null
    userEmail: string | null
    userPhone: string | null
  }) => {
    setUserName(data.userName)
    setUserEmail(data.userEmail)
    setUserPhone(data.userPhone)
  }

  const clearUserData = () => {
    setUserName(null)
    setUserEmail(null)
    setUserPhone(null)
  }

  return (
    <UserContext.Provider
      value={{ userName, userEmail, userPhone, isLoading, setUserData, clearUserData }}
    >
      {children}
    </UserContext.Provider>
  )
}
