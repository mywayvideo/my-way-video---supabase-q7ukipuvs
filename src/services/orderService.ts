import { supabase } from '@/lib/supabase/client'
import { Order } from '@/types/order'

export const orderService = {
  fetchOrderDetails: async (orderId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select(
        '*, customers(*), order_items(*, products(*)), shipping_address:customer_addresses!orders_shipping_address_id_fkey(*), billing_address:customer_addresses!orders_billing_address_id_fkey(*)',
      )
      .eq('id', orderId)
      .single()
    if (error) throw error
    return data
  },

  generateInvoicePDF: async (order: Order, logoUrl: string) => {
    const custName =
      (order as any).customers?.full_name || (order as any).customer?.full_name || order.customer_id
    const custEmail = (order as any).customers?.email || (order as any).customer?.email || 'N/A'
    let content = `My Way Video Professional Audiovisual Shop\nPedido: ${order.order_number}\nData: ${new Date(order.created_at).toLocaleDateString('pt-BR')}\nCliente: ${custName}\nEmail: ${custEmail}\n\nItens:\n`

    order.order_items?.forEach((item) => {
      content += `- ${item.products?.name || 'Produto'} (${item.quantity}x) - $${Number(item.total_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`
    })

    content += `\nSubtotal: $${Number(order.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nFrete: $${Number(order.shipping_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nDesconto: $${Number(order.discount_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nTotal: $${Number(order.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`

    if (order.payment_method_type === 'transfer') {
      content += `DADOS BANCÁRIOS PARA DEPÓSITO:\nBanco: Miami International Bank\nConta: 987654321\nRouting: 123456789\nTitular: My Way Video Shop\nSWIFT: MWVUS33\n\nFavor transferir para a conta acima. Pedido será processado após confirmação.\n\n`
    }

    content += `Obrigado pela sua compra!`
    return new Blob([content], { type: 'application/pdf' })
  },

  copyOrderToCart: async (orderId: string) => {
    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) throw new Error('Not authenticated')

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!customer) throw new Error('Customer not found')

    const { data: items, error } = await supabase
      .from('order_items')
      .select('*, products(*)')
      .eq('order_id', orderId)
    if (error) throw error

    let { data: cart } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('customer_id', customer.id)
      .single()

    if (!cart) {
      const { data: newCart, error: cartErr } = await supabase
        .from('shopping_carts')
        .insert({ customer_id: customer.id })
        .select()
        .single()
      if (cartErr) throw cartErr
      cart = newCart
    }

    if (items && items.length > 0) {
      const cartItemsData = items.map((item) => ({
        cart_id: cart.id,
        product_id: item.product_id,
        quantity: item.quantity,
        user_id: userId,
      }))

      for (const ci of cartItemsData) {
        const { data: existing } = await supabase
          .from('cart_items')
          .select('id, quantity')
          .eq('cart_id', cart.id)
          .eq('product_id', ci.product_id)
          .maybeSingle()
        if (existing) {
          await supabase
            .from('cart_items')
            .update({ quantity: existing.quantity + ci.quantity })
            .eq('id', existing.id)
        } else {
          await supabase.from('cart_items').insert(ci)
        }
      }

      let localCart: any[] = []
      try {
        localCart = JSON.parse(localStorage.getItem('cart') || '[]')
      } catch (e) {
        // ignore parse error
      }

      items.forEach((item: any) => {
        const existing = localCart.find((i: any) => (i.id || i.product_id) === item.product_id)
        if (existing) {
          existing.quantity += item.quantity
        } else {
          localCart.push({
            id: item.product_id,
            product_id: item.product_id,
            quantity: item.quantity,
            name: item.products?.name,
            price: item.products?.price_usd || item.unit_price,
            image_url: item.products?.image_url,
            product: item.products,
          })
        }
      })

      localStorage.setItem('cart', JSON.stringify(localCart))
      localStorage.setItem('cartItems', JSON.stringify(localCart))
      window.dispatchEvent(new Event('storage'))
    }
  },

  cancelOrderWithRefund: async (orderId: string, reason: string, paymentMethod: string) => {
    if (paymentMethod === 'card') {
      const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single()
      const paymentIntentId = order?.payment_data?.payment_intent_id
      if (paymentIntentId) {
        await supabase.functions.invoke('cancel-stripe-charge', { body: { paymentIntentId } })
      }
    } else {
      await supabase.functions.invoke('notify-admin-refund', { body: { orderId, reason } })
    }

    const { data: orderData } = await supabase
      .from('orders')
      .select('notes')
      .eq('id', orderId)
      .single()
    const now = new Date()
    const dateStr = now.toLocaleDateString('pt-BR')
    const timeStr = now.toLocaleTimeString('pt-BR')
    const cancelNote = `\nCancelamento realizado pelo cliente, motivo: ${reason} em ${dateStr} às ${timeStr}`
    const newNotes = (orderData?.notes || '') + cancelNote

    const { data: items } = await supabase.from('order_items').select('id').eq('order_id', orderId)

    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', notes: newNotes.trim() })
      .eq('id', orderId)
    if (error) throw error

    if (items && items.length > 0) {
      await supabase.from('order_returns').insert(
        items.map((item) => ({
          order_id: orderId,
          order_item_id: item.id,
          reason,
          status: paymentMethod === 'card' ? 'completed' : 'pending',
        })),
      )
    }

    await supabase.from('order_status_history').insert({
      order_id: orderId,
      old_status: 'pending',
      new_status: 'cancelled',
    })
  },
}
