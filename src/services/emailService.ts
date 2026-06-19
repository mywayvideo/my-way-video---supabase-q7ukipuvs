import { supabase } from '@/lib/supabase/client'

const formatCurrency = (amount: number) => `US$ ${amount.toFixed(2)}`

const getOrderDetails = async (orderId: string) => {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (orderError) throw orderError

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*, products(name)')
    .eq('order_id', orderId)
  if (itemsError) throw itemsError

  return { order, items }
}

const sendEmail = async (to: string, subject: string, htmlContent: string) => {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to, subject, htmlContent },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

const baseTemplate = (content: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
    <div style="text-align: center; margin-bottom: 20px;">
      <img src="https://img.usecurling.com/i?q=camera%20logo&color=black" alt="My Way Video" style="max-height: 60px;" />
    </div>
    ${content}
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
    <div style="text-align: center; font-size: 12px; color: #999;">
      <p>My Way Video</p>
      <p>contact@mywayvideo.com</p>
      <p><a href="#" style="color: #999;">Unsubscribe</a></p>
    </div>
  </div>
`

export const emailService = {
  sendNewOrderNotificationToAdmin: async (
    orderId: string,
    customerName: string,
    customerEmail: string,
    totalAmount: number,
    adminEmail = 'admin@mywayvideo.com',
  ) => {
    try {
      const { order, items } = await getOrderDetails(orderId)

      const itemsHtml = items
        .map(
          (i: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.products?.name || 'Produto'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(i.unit_price)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(i.total_price)}</td>
        </tr>
      `,
        )
        .join('')

      const htmlContent = baseTemplate(`
        <h2 style="color: #000;">Novo Pedido: ${order.order_number}</h2>
        <p><strong>Cliente:</strong> ${customerName} (${customerEmail})</p>
        <p><strong>Data:</strong> ${new Date(order.created_at).toLocaleString('pt-BR')}</p>
        <p><strong>Total:</strong> ${formatCurrency(totalAmount)}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        
        <h3 style="margin-top: 20px;">Itens do Pedido:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Produto</th>
              <th style="padding: 8px; border-bottom: 2px solid #ddd;">Qtd</th>
              <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Preço Unit.</th>
              <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://my-way-beta-ia.goskip.app/admin/orders" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Ver Pedido no Painel</a>
        </div>
      `)

      return await sendEmail(adminEmail, `Novo Pedido: ${order.order_number}`, htmlContent)
    } catch (err: any) {
      console.error('Error sending new order notification to admin:', err)
      throw new Error('Erro ao enviar notificação de novo pedido para admin.')
    }
  },

  sendOrderConfirmationToCustomer: async (
    orderId: string,
    customerEmail: string,
    customerName: string,
  ) => {
    try {
      const { order, items } = await getOrderDetails(orderId)

      const itemsHtml = items
        .map(
          (i: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${i.products?.name || 'Produto'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${i.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(i.unit_price)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(i.total_price)}</td>
        </tr>
      `,
        )
        .join('')

      const htmlContent = baseTemplate(`
        <h2 style="color: #000;">Confirmação de Pedido</h2>
        <p>Olá, <strong>${customerName}</strong>!</p>
        <p>Seu pagamento foi confirmado com sucesso e seu pedido já está sendo processado.</p>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Pedido:</strong> ${order.order_number}</p>
          <p style="margin: 0 0 10px 0;"><strong>Data:</strong> ${new Date(order.created_at).toLocaleString('pt-BR')}</p>
          <p style="margin: 0;"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
        </div>
        
        <h3 style="margin-top: 20px;">Itens do Pedido:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Produto</th>
              <th style="padding: 8px; border-bottom: 2px solid #ddd;">Qtd</th>
              <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Preço Unit.</th>
              <th style="text-align: right; padding: 8px; border-bottom: 2px solid #ddd;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <p style="margin-top: 20px;"><strong>Prazo estimado de entrega:</strong> Entre 7 a 15 dias úteis.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://my-way-beta-ia.goskip.app/dashboard" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Acompanhar Pedido</a>
        </div>
        <p style="text-align: center; margin-top: 20px;"><a href="mailto:suporte@mywayvideo.com" style="color: #000;">Entrar em contato com o suporte</a></p>
      `)

      return await sendEmail(
        customerEmail,
        `Confirmação do Pedido ${order.order_number}`,
        htmlContent,
      )
    } catch (err: any) {
      console.error('Error sending order confirmation:', err)
      throw new Error('Erro ao enviar confirmação de pedido.')
    }
  },

  sendOrderRejectionToCustomer: async (
    orderId: string,
    customerEmail: string,
    customerName: string,
    rejectionReason = '',
  ) => {
    try {
      const { order } = await getOrderDetails(orderId)

      const htmlContent = baseTemplate(`
        <h2 style="color: #d32f2f;">Pedido Rejeitado</h2>
        <p>Olá, <strong>${customerName}</strong>.</p>
        <p>Infelizmente, seu pedido <strong>${order.order_number}</strong> foi cancelado.</p>
        
        ${rejectionReason ? `<p style="background: #fff3f3; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;"><strong>Motivo:</strong> ${rejectionReason}</p>` : ''}
        
        <p>Caso tenha ocorrido algum problema com o pagamento, você pode tentar refazer o pedido no nosso site.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://my-way-beta-ia.goskip.app/search" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Ver Produtos</a>
        </div>
        <p style="text-align: center; margin-top: 20px;"><a href="mailto:suporte@mywayvideo.com" style="color: #000;">Entrar em contato com o suporte</a></p>
      `)

      return await sendEmail(
        customerEmail,
        `Atualização do Pedido ${order.order_number}`,
        htmlContent,
      )
    } catch (err: any) {
      console.error('Error sending order rejection:', err)
      throw new Error('Erro ao enviar notificação de rejeição de pedido.')
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
  ) => {
    try {
      const { order } = await getOrderDetails(orderId)

      const htmlContent = baseTemplate(`
        <h2 style="color: #000;">Reembolso Processado</h2>
        <p>Olá, <strong>${customerName}</strong>.</p>
        <p>O reembolso referente ao pedido <strong>${order.order_number}</strong> foi processado com sucesso.</p>
        
        <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Valor do Reembolso:</strong> ${formatCurrency(refundAmount)}</p>
          <p style="margin: 0 0 10px 0;"><strong>Motivo:</strong> ${refundReason}</p>
          <p style="margin: 0 0 10px 0;"><strong>Banco:</strong> ${bankName}</p>
          <p style="margin: 0;"><strong>Titular da Conta:</strong> ${bankAccountHolder}</p>
        </div>
        
        <p>O valor deverá constar na sua conta em até <strong>3 a 5 dias úteis</strong>.</p>
        
        <p style="text-align: center; margin-top: 30px;"><a href="mailto:suporte@mywayvideo.com" style="color: #000;">Entrar em contato com o suporte</a></p>
      `)

      return await sendEmail(
        customerEmail,
        `Reembolso do Pedido ${order.order_number}`,
        htmlContent,
      )
    } catch (err: any) {
      console.error('Error sending refund notification:', err)
      throw new Error('Erro ao enviar notificação de reembolso.')
    }
  },
}
