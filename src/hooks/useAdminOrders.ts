import React, { useState, useCallback } from 'react'
import { adminOrdersService, GetOrdersFilters } from '@/services/adminOrdersService'
import { AdminOrder } from '@/types/admin-order'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase/client'
import { emailService } from '@/services/emailService'

export const useAdminOrders = () => {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [filters, setFilters] = useState<GetOrdersFilters>({ page: 1, limit: 10 })
  const { toast } = useToast()

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { orders, count } = await adminOrdersService.getOrders(filters)
      setOrders(orders)
      setTotalCount(count || 0)
    } catch (err: any) {
      setError(err.message)
      toast({ title: 'Erro de conexão. Tente novamente.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [filters, toast])

  const approveOrder = async (order: AdminOrder) => {
    try {
      await adminOrdersService.updateOrderStatus(order.id, 'paid')
      toast({ title: 'Pedido aprovado e emails enviados com sucesso!' })

      const sendEmails = () => {
        Promise.all([
          emailService.sendNewOrderNotificationToAdmin(
            order.id,
            order.customer_name,
            order.customer_email,
            order.total_amount,
          ),
          emailService.sendOrderConfirmationToCustomer(
            order.id,
            order.customer_email,
            order.customer_name,
          ),
        ]).catch((err) => {
          console.error('Email error:', err)
          toast({
            title: 'Pedido atualizado, mas erro ao enviar email. Tente novamente.',
            variant: 'destructive',
            action: React.createElement(
              ToastAction,
              { altText: 'Tentar novamente', onClick: sendEmails },
              'Tentar Novamente',
            ),
          })
        })
      }
      sendEmails()

      fetchOrders()
    } catch (err) {
      toast({ title: 'Erro ao atualizar pedido. Tente novamente.', variant: 'destructive' })
      throw err
    }
  }

  const rejectOrder = async (order: AdminOrder) => {
    try {
      await adminOrdersService.rejectOrder(order.id)
      toast({ title: 'Pedido rejeitado e email enviado ao cliente.' })

      const sendEmails = () => {
        emailService
          .sendOrderRejectionToCustomer(order.id, order.customer_email, order.customer_name)
          .catch((err) => {
            console.error('Email error:', err)
            toast({
              title: 'Pedido atualizado, mas erro ao enviar email. Tente novamente.',
              variant: 'destructive',
              action: React.createElement(
                ToastAction,
                { altText: 'Tentar novamente', onClick: sendEmails },
                'Tentar Novamente',
              ),
            })
          })
      }
      sendEmails()

      fetchOrders()
    } catch (err) {
      toast({ title: 'Erro ao atualizar pedido. Tente novamente.', variant: 'destructive' })
      throw err
    }
  }

  const processRefund = async (order: AdminOrder, refundData: any) => {
    try {
      await adminOrdersService.processRefund(order.id, refundData)
      toast({ title: 'Devolucao processada e email enviado ao cliente.' })

      const sendEmails = () => {
        emailService
          .sendRefundNotificationToCustomer(
            order.id,
            order.customer_email,
            order.customer_name,
            Number(refundData.amount),
            refundData.reason,
            refundData.bankHolderName,
            refundData.bankName,
          )
          .catch((err) => {
            console.error('Email error:', err)
            toast({
              title: 'Pedido atualizado, mas erro ao enviar email. Tente novamente.',
              variant: 'destructive',
              action: React.createElement(
                ToastAction,
                { altText: 'Tentar novamente', onClick: sendEmails },
                'Tentar Novamente',
              ),
            })
          })
      }
      sendEmails()

      fetchOrders()
    } catch (err) {
      toast({ title: 'Erro ao atualizar pedido. Tente novamente.', variant: 'destructive' })
      throw err
    }
  }

  return {
    orders,
    loading,
    error,
    totalCount,
    filters,
    setFilters,
    fetchOrders,
    approveOrder,
    rejectOrder,
    processRefund,
  }
}
