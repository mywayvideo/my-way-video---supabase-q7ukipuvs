import { supabase } from '@/lib/supabase/client'
import {
  getDeliveryCountry,
  getShippingCost,
  resolveItemPriceInfo,
  formatItemUnitPrice,
  formatItemTotalPrice,
  formatCurrencyByCountry,
  calculateSummarySubtotal,
} from '@/utils/orderCurrency'

const LOGO_URL =
  'https://ymlkyspcznrrmlktudxx.supabase.co/storage/v1/object/public/brand-assets/my-way-video-logo.png'
const FROM_EMAIL = 'support@noreply.mywayvideo.com'
const FROM_NAME = 'MY WAY VIDEO'
const BASE_URL = 'https://my-way-video.goskip.app'
const ADMIN_EMAIL = 'plynchusa@gmail.com'

interface EmailResult {
  success: boolean
  error?: string
}

const getOrderDetails = async (orderId: string) => {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (orderError) throw orderError

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*, products(name, price_usd, price_nationalized_sales, price_nationalized_currency)')
    .eq('order_id', orderId)
  if (itemsError) throw itemsError

  let shippingAddress = null
  if (order.shipping_address_id) {
    const { data: addr } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('id', order.shipping_address_id)
      .maybeSingle()
    shippingAddress = addr
  }

  const country = getDeliveryCountry(order, shippingAddress)
  return { order, items, country }
}

const buildItemsTable = (items: any[], country: string | null) => {
  const rows = items
    .map(
      (i: any) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.products?.name || 'Produto'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatItemUnitPrice(i, country)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatItemTotalPrice(i, country)}</td>
    </tr>`,
    )
    .join('')
  return `
    <table style="width: 100%; border-collapse: collapse;">
      <thead><tr>
        <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Produto</th>
        <th style="padding: 8px; border-bottom: 2px solid #ddd;">Qtd</th>
        <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Preço Unit.</th>
        <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Subtotal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

const buildSummary = (order: any, country: string | null) => {
  const shippingCost = getShippingCost(order)
  const isShippingIncluded = shippingCost === 0
  const shippingDisplay = isShippingIncluded
    ? 'incluso'
    : formatCurrencyByCountry(shippingCost, country)
  const subtotalValue = calculateSummarySubtotal(order, country)

  return `
    <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Sub-total:</span><span>${formatCurrencyByCountry(subtotalValue, country)}</span></div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Frete:</span><span>${shippingDisplay}</span></div>
      ${Number(order.discount_amount) > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Desconto:</span><span>- ${formatCurrencyByCountry(order.discount_amount, country)}</span></div>` : ''}
      <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #ddd; padding-top: 8px;"><span>Total:</span><span>${formatCurrencyByCountry(order.total, country)}</span></div>
    </div>`
}

const baseTemplate = (content: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="${LOGO_URL}" alt="MY WAY VIDEO" style="max-height: 60px;" />
    </div>
    ${content}
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
    <div style="text-align: center; font-size: 12px; color: #999;">
      <p>MY WAY VIDEO</p>
      <p>contact@mywayvideo.com</p>
    </div>
  </div>`

const buildEmailContext = (order: any, items: any[], country: string | null) => ({
  pricingContext: {
    country,
    itemCount: items.length,
    nationalizedItems: items.filter((i: any) => resolveItemPriceInfo(i, country).isNationalized)
      .length,
  },
  shippingContext: {
    shippingCost: getShippingCost(order),
    isIncluded: getShippingCost(order) === 0,
  },
})

const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string,
  context?: { pricingContext?: any; shippingContext?: any },
): Promise<EmailResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-order-email', {
      body: {
        to,
        subject,
        htmlContent,
        fromEmail: FROM_EMAIL,
        fromName: FROM_NAME,
        pricingContext: context?.pricingContext,
        shippingContext: context?.shippingContext,
      },
    })
    if (error) return { success: false, error: error.message || 'Edge function error' }
    if (data?.error) return { success: false, error: data.error }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown error' }
  }
}

const handleResult = (r: EmailResult, ctx: string) => {
  if (!r.success) console.warn(`[emailService] ${ctx} - email not sent. Error: ${r.error}`)
  return r
}

export const emailService = {
  sendNewOrderNotificationToAdmin: async (
    orderId: string,
    customerName: string,
    customerEmail: string,
    _totalAmount: number,
    adminEmail = ADMIN_EMAIL,
  ): Promise<EmailResult> => {
    try {
      const { order, items, country } = await getOrderDetails(orderId)
      const html = baseTemplate(`
        <h2 style="color: #000;">Novo Pedido: ${order.order_number}</h2>
        <p><strong>Cliente:</strong> ${customerName} (${customerEmail})</p>
        <p><strong>Data:</strong> ${new Date(order.created_at).toLocaleString('pt-BR')}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        <h3 style="margin-top: 20px;">Itens do Pedido:</h3>
        ${buildItemsTable(items, country)}
        ${buildSummary(order, country)}
        <div style="text-align: center; margin-top: 30px;">
          <a href="${BASE_URL}/admin/orders" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Ver Pedido no Painel</a>
        </div>`)
      return handleResult(
        await sendEmail(
          adminEmail,
          `Novo Pedido: ${order.order_number}`,
          html,
          buildEmailContext(order, items, country),
        ),
        'sendNewOrderNotificationToAdmin',
      )
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unknown error' }
    }
  },

  sendOrderConfirmationToCustomer: async (
    orderId: string,
    customerEmail: string,
    customerName: string,
  ): Promise<EmailResult> => {
    try {
      const { order, items, country } = await getOrderDetails(orderId)
      const html = baseTemplate(`
        <h2 style="color: #000;">Confirmação de Pedido</h2>
        <p>Olá, <strong>${customerName}</strong>!</p>
        <p>Seu pagamento foi confirmado com sucesso e seu pedido já está sendo processado.</p>
        <p style="margin: 10px 0;"><strong>Pedido:</strong> ${order.order_number}<br/><strong>Data:</strong> ${new Date(order.created_at).toLocaleString('pt-BR')}</p>
        <h3 style="margin-top: 20px;">Itens do Pedido:</h3>
        ${buildItemsTable(items, country)}
        ${buildSummary(order, country)}
        <div style="text-align: center; margin-top: 30px;">
          <a href="${BASE_URL}/dashboard" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Acompanhar Pedido</a>
        </div>
        <p style="text-align: center; margin-top: 20px;"><a href="mailto:suporte@mywayvideo.com" style="color: #000;">Entrar em contato com o suporte</a></p>`)
      return handleResult(
        await sendEmail(
          customerEmail,
          `Confirmação do Pedido ${order.order_number}`,
          html,
          buildEmailContext(order, items, country),
        ),
        'sendOrderConfirmationToCustomer',
      )
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unknown error' }
    }
  },

  sendOrderRejectionToCustomer: async (
    orderId: string,
    customerEmail: string,
    customerName: string,
    rejectionReason = '',
  ): Promise<EmailResult> => {
    try {
      const { order, country } = await getOrderDetails(orderId)
      const html = baseTemplate(`
        <h2 style="color: #d32f2f;">Pedido Cancelado</h2>
        <p>Olá, <strong>${customerName}</strong>.</p>
        <p>Informamos que seu pedido <strong>${order.order_number}</strong> foi cancelado.</p>
        ${rejectionReason ? `<p style="background: #fff3f3; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;"><strong>Motivo:</strong> ${rejectionReason}</p>` : ''}
        <p>Caso tenha ocorrido algum problema com o pagamento, você pode tentar refazer o pedido no nosso site.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${BASE_URL}/search" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Ver Produtos</a>
        </div>
        <p style="text-align: center; margin-top: 20px;"><a href="mailto:suporte@mywayvideo.com" style="color: #000;">Entrar em contato com o suporte</a></p>`)
      return handleResult(
        await sendEmail(customerEmail, `Atualização do Pedido ${order.order_number}`, html),
        'sendOrderRejectionToCustomer',
      )
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unknown error' }
    }
  },

  sendCancellationNotificationToAdmin: async (
    orderId: string,
    customerName: string,
    customerEmail: string,
    cancellationReason = '',
    adminEmail = ADMIN_EMAIL,
  ): Promise<EmailResult> => {
    try {
      const { order, items, country } = await getOrderDetails(orderId)
      const html = baseTemplate(`
        <h2 style="color: #d32f2f;">Pedido Cancelado: ${order.order_number}</h2>
        <p><strong>Cliente:</strong> ${customerName} (${customerEmail})</p>
        <p><strong>Data do Cancelamento:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        ${cancellationReason ? `<p style="background: #fff3f3; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;"><strong>Motivo:</strong> ${cancellationReason}</p>` : ''}
        <h3 style="margin-top: 20px;">Itens do Pedido:</h3>
        ${buildItemsTable(items, country)}
        ${buildSummary(order, country)}
        <div style="text-align: center; margin-top: 30px;">
          <a href="${BASE_URL}/admin/orders" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Ver Pedido no Painel</a>
        </div>`)
      return handleResult(
        await sendEmail(
          adminEmail,
          `Pedido Cancelado: ${order.order_number}`,
          html,
          buildEmailContext(order, items, country),
        ),
        'sendCancellationNotificationToAdmin',
      )
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unknown error' }
    }
  },

  sendRefundNotificationToCustomer: async (
    orderId: string,
    customerEmail: string,
    customerName: string,
    refundAmount: number,
    refundReason: string,
    bankAccountHolder: string,
    bankName: string,
  ): Promise<EmailResult> => {
    try {
      const { order, country } = await getOrderDetails(orderId)
      const html = baseTemplate(`
        <h2 style="color: #000;">Reembolso Processado</h2>
        <p>Olá, <strong>${customerName}</strong>.</p>
        <p>O reembolso referente ao pedido <strong>${order.order_number}</strong> foi processado com sucesso.</p>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Valor do Reembolso:</strong> ${formatCurrencyByCountry(refundAmount, country)}</p>
          <p style="margin: 0 0 10px 0;"><strong>Motivo:</strong> ${refundReason}</p>
          <p style="margin: 0 0 10px 0;"><strong>Banco:</strong> ${bankName}</p>
          <p style="margin: 0;"><strong>Titular da Conta:</strong> ${bankAccountHolder}</p>
        </div>
        <p>O valor deverá constar na sua conta em até <strong>3 a 5 dias úteis</strong>.</p>
        <p style="text-align: center; margin-top: 30px;"><a href="mailto:suporte@mywayvideo.com" style="color: #000;">Entrar em contato com o suporte</a></p>`)
      return handleResult(
        await sendEmail(customerEmail, `Reembolso do Pedido ${order.order_number}`, html),
        'sendRefundNotificationToCustomer',
      )
    } catch (err: any) {
      return { success: false, error: err?.message || 'Unknown error' }
    }
  },

  sendOrderEmails: async (
    orderId: string,
    customerName: string,
    customerEmail: string,
    totalAmount: number,
  ): Promise<void> => {
    try {
      await Promise.allSettled([
        emailService.sendNewOrderNotificationToAdmin(
          orderId,
          customerName,
          customerEmail,
          totalAmount,
        ),
        emailService.sendOrderConfirmationToCustomer(orderId, customerEmail, customerName),
      ])
    } catch (err: any) {
      console.warn('[emailService] sendOrderEmails - non-blocking failure:', err?.message || err)
    }
  },

  sendCancellationEmails: async (
    orderId: string,
    customerName: string,
    customerEmail: string,
    cancellationReason = '',
  ): Promise<void> => {
    try {
      await Promise.allSettled([
        emailService.sendOrderRejectionToCustomer(
          orderId,
          customerEmail,
          customerName,
          cancellationReason,
        ),
        emailService.sendCancellationNotificationToAdmin(
          orderId,
          customerName,
          customerEmail,
          cancellationReason,
        ),
      ])
    } catch (err: any) {
      console.warn(
        '[emailService] sendCancellationEmails - non-blocking failure:',
        err?.message || err,
      )
    }
  },
}
