import { Link } from 'react-router-dom'
import { DirectSearch } from '@/components/DirectSearch'
import { ShoppingCart, User, Heart, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import mwLogo from '../assets/mwlogohorizv03smalldarkback-c68bc.png'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuthContext } from '@/contexts/AuthContext'

export function Header() {
  const { user } = useAuthContext()
  const [isAdmin, setIsAdmin] = useState(false)
  const [customerInfo, setCustomerInfo] = useState<{
    full_name: string | null
    profile_photo_url: string | null
  } | null>(null)

  useEffect(() => {
    async function fetchUserData() {
      if (!user) {
        setIsAdmin(false)
        setCustomerInfo(null)
        return
      }

      const { data } = await supabase
        .from('customers')
        .select('role, full_name, profile_photo_url')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setIsAdmin(data.role === 'admin')
        setCustomerInfo({
          full_name: data.full_name,
          profile_photo_url: data.profile_photo_url,
        })
      } else {
        setIsAdmin(false)
        setCustomerInfo(null)
      }
    }

    fetchUserData()
  }, [user])

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-3 md:py-0 min-h-16 h-auto md:h-16 flex flex-wrap md:flex-nowrap items-center justify-between gap-y-3 gap-x-4">
        <Link
          to="/"
          onClick={(e) => {
            if (window.location.pathname === '/') {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            } else {
              window.scrollTo(0, 0)
            }
          }}
          className="flex items-center shrink-0 order-1"
        >
          <img
            src={mwLogo}
            alt="My Way Video"
            className="h-10 sm:h-12 w-auto object-contain"
            loading="eager"
          />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0 order-2 md:order-3">
          {isAdmin && (
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/dashboard">
                <Settings className="w-5 h-5" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" asChild className="hidden sm:flex">
            <Link to="/favorites">
              <Heart className="w-5 h-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link to="/cart">
              <ShoppingCart className="w-5 h-5" />
            </Link>
          </Button>
          {user ? (
            <Button variant="ghost" size="icon" className="rounded-full overflow-hidden" asChild>
              <Link to="/dashboard">
                {customerInfo?.profile_photo_url ? (
                  <img
                    src={customerInfo.profile_photo_url}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : customerInfo?.full_name ? (
                  <div className="w-full h-full flex items-center justify-center bg-muted text-foreground text-xs font-semibold">
                    {getInitials(customerInfo.full_name)}
                  </div>
                ) : (
                  <User className="w-5 h-5" />
                )}
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" asChild>
              <Link to="/login">
                <User className="w-5 h-5" />
              </Link>
            </Button>
          )}
        </div>

        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 flex justify-center md:max-w-2xl px-0 md:px-4">
          <DirectSearch />
        </div>
      </div>
    </header>
  )
}
