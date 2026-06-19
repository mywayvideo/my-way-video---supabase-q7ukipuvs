import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Layout from './components/Layout'
import Index from './pages/Index'
import Search from './pages/Search'
import SearchResults from './pages/SearchResults'
import Product from './pages/Product'
import Admin from './pages/Admin'
import AdminAIProviders from './pages/AdminAIProviders'
import AdminProductCache from './pages/AdminProductCache'
import AdminAISettings from './pages/admin/ai-settings'
import AdminAIPage from './pages/admin/AdminAIPage'
import AdminCatalogPage from './pages/admin/AdminCatalogPage'
import AdminAVProKeywordsPage from './pages/admin/AdminAVProKeywordsPage'
import ProductsPage from './pages/admin/ProductsPage'
import AdminPricingPage from './pages/admin/AdminPricingPage'
import NewProductPage from './pages/admin/NewProductPage'
import SettingsPage from './pages/admin/SettingsPage'
import ShippingConfigPage from './pages/admin/ShippingConfigPage'
import Dashboard from './pages/Dashboard'
import AdminDiscountsPage from './pages/admin/AdminDiscountsPage'
import AdminCustomersPage from './pages/admin/AdminCustomersPage'
import AdminMetricsPage from './pages/admin/AdminMetricsPage'
import AdminProfilePage from './pages/admin/AdminProfilePage'
import AdminOrdersPage from './pages/admin/AdminOrdersPage'
import AssistedCheckoutPage from './pages/admin/AssistedCheckoutPage'
import NABHub from './pages/admin/NABHub'
import Login from './pages/Login'
import Signup from './pages/Signup'
import NotFound from './pages/NotFound'
import Favorites from './pages/Favorites'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import CheckoutSuccess from './pages/CheckoutSuccess'
import MigrationSetup from './pages/MigrationSetup'
import ForgotPassword from './pages/ForgotPassword'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import RefundPolicy from './pages/RefundPolicy'
import ShippingPolicy from './pages/ShippingPolicy'
import ResetPassword from './pages/ResetPassword'
import ProtectedRoute from '@/components/ProtectedRoute'
import { AuthProvider } from '@/contexts/AuthContext'
import { CartProvider } from '@/hooks/useCart'
import { HelmetProvider } from 'react-helmet-async'

const App = () => {
  const [isCleaningUp, setIsCleaningUp] = useState(false)

  useEffect(() => {
    // Redirect logic temporarily disabled for development/testing
    /*
    if (import.meta.env.PROD) {
      const hostname = window.location.hostname
      if (
        hostname.includes('skip.tools') ||
        hostname.includes('vercel.app') ||
        hostname.includes('goskip.app')
      ) {
        window.location.href =
          'https://mywayvideo.com' + window.location.pathname + window.location.search
      }
    }
    */

    const handleLogout = () => {
      setIsCleaningUp(true)
      window.history.pushState({}, '', '/login')

      setTimeout(() => {
        setIsCleaningUp(false)
      }, 1000)
    }

    window.addEventListener('auth-logout', handleLogout)
    return () => window.removeEventListener('auth-logout', handleLogout)
  }, [])

  return (
    <HelmetProvider>
      <AuthProvider>
        {isCleaningUp && (
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <CartProvider>
          <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/search-results" element={<SearchResults />} />
                  <Route path="/product/:id" element={<Product />} />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <Admin />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/dashboard"
                    element={
                      <ProtectedRoute>
                        <Admin />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/ai"
                    element={
                      <ProtectedRoute>
                        <AdminAIPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/catalog"
                    element={
                      <ProtectedRoute>
                        <AdminCatalogPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/avpro-keywords"
                    element={
                      <ProtectedRoute>
                        <AdminAVProKeywordsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/products"
                    element={
                      <ProtectedRoute>
                        <ProductsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/new"
                    element={
                      <ProtectedRoute>
                        <NewProductPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/edit/:id"
                    element={
                      <ProtectedRoute>
                        <NewProductPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/pricing"
                    element={
                      <ProtectedRoute>
                        <AdminPricingPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/ai-providers"
                    element={
                      <ProtectedRoute>
                        <AdminAIProviders />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/product-cache"
                    element={
                      <ProtectedRoute>
                        <AdminProductCache />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/ai-settings"
                    element={
                      <ProtectedRoute>
                        <AdminAISettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/settings"
                    element={
                      <ProtectedRoute>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/nab-hub"
                    element={
                      <ProtectedRoute>
                        <NABHub />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/shipping-config"
                    element={
                      <ProtectedRoute>
                        <ShippingConfigPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/discounts"
                    element={
                      <ProtectedRoute>
                        <AdminDiscountsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/orders"
                    element={
                      <ProtectedRoute>
                        <AdminOrdersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/checkout-assistido/:customerId"
                    element={
                      <ProtectedRoute>
                        <AssistedCheckoutPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/customers"
                    element={
                      <ProtectedRoute>
                        <AdminCustomersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/metrics"
                    element={
                      <ProtectedRoute>
                        <AdminMetricsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/profile"
                    element={
                      <ProtectedRoute>
                        <AdminProfilePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/migration-setup" element={<MigrationSetup />} />
                  <Route path="/favorites" element={<Favorites />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/checkout/success" element={<CheckoutSuccess />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms-of-service" element={<TermsOfService />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/shipping-policy" element={<ShippingPolicy />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TooltipProvider>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </HelmetProvider>
  )
}

export default App
