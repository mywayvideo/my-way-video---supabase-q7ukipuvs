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
import CategoryPage from './pages/CategoryPage'
import Admin from './pages/Admin'
import DashboardAdmin from './pages/DashboardAdmin'
import AdminAIProviders from './pages/AdminAIProviders'
import AdminProductCache from './pages/AdminProductCache'
import AdminAISettings from './pages/admin/ai-settings'
import AdminAIPage from './pages/admin/AdminAIPage'
import AdminCatalogPage from './pages/admin/AdminCatalogPage'
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage'
import AdminImportReviewPage from './pages/admin/AdminImportReviewPage'
import AdminScanSourcePage from './pages/admin/AdminScanSourcePage'
import AdminRelatedRulesPage from './pages/admin/AdminRelatedRulesPage'
import AdminRelatedReviewPage from './pages/admin/AdminRelatedReviewPage'
import { AdminBhUpdatePage } from './pages/admin/AdminBhUpdatePage'
import AdminSkuStandardizationPage from './pages/admin/AdminSkuStandardizationPage'
import { AdminPriceChecksPage } from './pages/admin/AdminPriceChecksPage'
import AdminAVProKeywordsPage from './pages/admin/AdminAVProKeywordsPage'
import AdminNcmSupportPage from './pages/admin/AdminNcmSupportPage'
import AdminProductsPage from './pages/admin/AdminProductsPage'
import ProductFormPage from './pages/admin/ProductFormPage'
import AdminPricingPage from './pages/admin/AdminPricingPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminNabHubPage from './pages/admin/AdminNabHubPage'
import AdminShippingConfigPage from './pages/admin/AdminShippingConfigPage'
import AdminDiscountsPage from './pages/admin/AdminDiscountsPage'
import AdminOrdersPage from './pages/admin/AdminOrdersPage'
import AdminCheckoutAssistidoPage from './pages/admin/AdminCheckoutAssistidoPage'
import AdminCustomersPage from './pages/admin/AdminCustomersPage'
import AdminMetricsPage from './pages/admin/AdminMetricsPage'
import AdminProfilePage from './pages/admin/AdminProfilePage'
import AdminPaymentConfigPage from './pages/admin/AdminPaymentConfigPage'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import MigrationSetup from './pages/MigrationSetup'
import NcmDemo from './pages/NcmDemo'
import Favorites from './pages/Favorites'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import CheckoutSuccess from './pages/CheckoutSuccess'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import RefundPolicy from './pages/RefundPolicy'
import ShippingPolicy from './pages/ShippingPolicy'
import NotFound from './pages/NotFound'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { AIConsultantProvider } from '@/contexts/AIConsultantContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { HelmetProvider } from 'react-helmet-async'

function AppRoutes() {
  const { isCleaningUp } = useAuth()

  useEffect(() => {
    const handleLogout = () => {
      // limpeza de estado ao deslogar
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
          <AIConsultantProvider>
            {/* @ts-expect-error future flags are supported by react-router-dom v6/v7 */}
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
                    <Route path="/categoria/:id" element={<CategoryPage />} />
                  </Route>

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
                        <DashboardAdmin />
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
                    path="/admin/categories"
                    element={
                      <ProtectedRoute>
                        <AdminCategoriesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/import-review"
                    element={
                      <ProtectedRoute>
                        <AdminImportReviewPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/scansource"
                    element={
                      <ProtectedRoute>
                        <AdminScanSourcePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/related-rules"
                    element={
                      <ProtectedRoute>
                        <AdminRelatedRulesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/related-review"
                    element={
                      <ProtectedRoute>
                        <AdminRelatedReviewPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/bh-update"
                    element={
                      <ProtectedRoute>
                        <AdminBhUpdatePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/sku-standardization"
                    element={
                      <ProtectedRoute>
                        <AdminSkuStandardizationPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/price-checks"
                    element={
                      <ProtectedRoute>
                        <AdminPriceChecksPage />
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
                    path="/admin/ncm-support"
                    element={
                      <ProtectedRoute>
                        <AdminNcmSupportPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/products"
                    element={
                      <ProtectedRoute>
                        <AdminProductsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/new"
                    element={
                      <ProtectedRoute>
                        <ProductFormPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/edit/:id"
                    element={
                      <ProtectedRoute>
                        <ProductFormPage />
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
                    path="/admin/settings"
                    element={
                      <ProtectedRoute>
                        <AdminSettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/nab-hub"
                    element={
                      <ProtectedRoute>
                        <AdminNabHubPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/shipping-config"
                    element={
                      <ProtectedRoute>
                        <AdminShippingConfigPage />
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
                        <AdminCheckoutAssistidoPage />
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
                  <Route
                    path="/admin/payment-config"
                    element={
                      <ProtectedRoute>
                        <AdminPaymentConfigPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/migration-setup" element={<MigrationSetup />} />
                  <Route path="/ncm-demo" element={<NcmDemo />} />
                  <Route path="/favorites" element={<Favorites />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/checkout/success" element={<CheckoutSuccess />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms-of-service" element={<TermsOfService />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/shipping-policy" element={<ShippingPolicy />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </TooltipProvider>
            </BrowserRouter>
          </AIConsultantProvider>
        </CartProvider>
      </AuthProvider>
    </HelmetProvider>
  )
}

export default AppRoutes
