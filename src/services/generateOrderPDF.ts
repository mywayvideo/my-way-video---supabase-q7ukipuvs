import jsPDF from 'jspdf'
import { supabase } from '@/lib/supabase/client'

export const generateOrderPDF = async (orderData: any): Promise<jsPDF | null> => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const { data: settings } = await supabase
      .from('app_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['company_name', 'company_address', 'company_email'])

    const companyName =
      settings?.find((s: any) => s.setting_key === 'company_name')?.setting_value || 'My Way Video'
    const companyAddress =
      settings?.find((s: any) => s.setting_key === 'company_address')?.setting_value ||
      'Miami, FL 33122'
    const companyEmail =
      settings?.find((s: any) => s.setting_key === 'company_email')?.setting_value ||
      'contato@mywayvideo.com'

    try {
      const logoUrl = '/logo.png'
      const img = new Image()
      img.src = logoUrl
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      doc.addImage(img, 'PNG', 15, 15, 40, 15)
    } catch (e) {
      // Ignore logo error
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(80, 80, 80)
    doc.text(companyName, 195, 15, { align: 'right' })
    doc.text(companyAddress, 195, 20, { align: 'right' })
    doc.text(companyEmail, 195, 25, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(50, 50, 50)
    doc.text('PEDIDO DE COMPRA', 105, 45, { align: 'center' })

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Detalhes do Pedido:', 15, 60)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(
      `Número do Pedido: ${orderData.orderNumber || orderData.order_number || 'N/A'}`,
      15,
      67,
    )

    const orderDate =
      orderData.createdAt || orderData.created_at
        ? new Date(orderData.createdAt || orderData.created_at).toLocaleDateString('pt-BR')
        : 'N/A'
    doc.text(`Data: ${orderDate}`, 15, 73)

    const custName =
      orderData.customerName ||
      orderData.customers?.full_name ||
      orderData.customer?.full_name ||
      'N/A'
    const custEmail =
      orderData.customerEmail || orderData.customers?.email || orderData.customer?.email || 'N/A'

    doc.text(`Cliente: ${custName}`, 15, 79)
    doc.text(`Email: ${custEmail}`, 15, 85)

    doc.text(
      `Método de Entrega: ${orderData.deliveryMethod || orderData.shipping_method || 'N/A'}`,
      15,
      91,
    )
    doc.text(
      `Método de Pagamento: ${orderData.paymentMethod || orderData.payment_method_type || 'N/A'}`,
      15,
      97,
    )

    const isBrl =
      orderData.paymentMethod === 'transferencia_brasil' ||
      orderData.paymentMethod === 'pix' ||
      orderData.payment_method_type === 'transferencia_brasil' ||
      orderData.payment_method_type === 'pix'
    const currencySym = isBrl ? 'R$' : 'US$'

    const formatMoney = (val: number) => {
      return Number(val).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }

    let yPos = 110
    doc.setFont('helvetica', 'bold')
    doc.setFillColor(240, 240, 240)
    doc.rect(15, yPos - 5, 180, 8, 'F')
    doc.text('Item', 17, yPos)
    doc.text('Qtd', 125, yPos, { align: 'center' })
    doc.text('Preço Unit.', 160, yPos, { align: 'right' })
    doc.text('Total', 190, yPos, { align: 'right' })

    yPos += 8
    doc.setFont('helvetica', 'normal')

    const items = orderData.items || orderData.order_items || []
    items.forEach((item: any) => {
      const name = item.name || item.products?.name || 'Produto'
      const qty = item.quantity || item.qtd || 1
      const unitPrice = item.unitPrice || item.unit_price || 0
      const total = item.total || item.total_price || qty * unitPrice

      const shortName = name.length > 50 ? name.substring(0, 47) + '...' : name

      doc.text(shortName, 17, yPos)
      doc.text(qty.toString(), 125, yPos, { align: 'center' })
      doc.text(`${currencySym} ${formatMoney(unitPrice)}`, 160, yPos, { align: 'right' })
      doc.text(`${currencySym} ${formatMoney(total)}`, 190, yPos, { align: 'right' })
      yPos += 7
    })

    yPos += 5
    doc.line(15, yPos, 195, yPos)
    yPos += 8

    const subtotal = orderData.subtotal || 0
    const shipping = orderData.shipping || orderData.shipping_cost || 0
    const tax = orderData.tax || orderData.tax_amount || 0
    const discount = orderData.discount_amount || 0
    const total = orderData.total || 0

    doc.text(`Subtotal:`, 160, yPos, { align: 'right' })
    doc.text(`${currencySym} ${formatMoney(subtotal)}`, 190, yPos, { align: 'right' })
    yPos += 7

    if (discount > 0) {
      doc.text(`Desconto:`, 160, yPos, { align: 'right' })
      doc.text(`-${currencySym} ${formatMoney(discount)}`, 190, yPos, { align: 'right' })
      yPos += 7
    }

    doc.text(`Frete:`, 160, yPos, { align: 'right' })
    doc.text(`${currencySym} ${formatMoney(shipping)}`, 190, yPos, { align: 'right' })
    yPos += 7

    if (tax > 0) {
      doc.text(`Impostos:`, 160, yPos, { align: 'right' })
      doc.text(`${currencySym} ${formatMoney(tax)}`, 190, yPos, { align: 'right' })
      yPos += 7
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(16, 185, 129)
    doc.text(`Total:`, 160, yPos, { align: 'right' })
    doc.text(`${currencySym} ${formatMoney(total)}`, 190, yPos, { align: 'right' })

    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.setFont('helvetica', 'normal')
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 15, pageHeight - 10)
    doc.text(`Página 1 de 1`, 195, pageHeight - 10, { align: 'right' })

    return doc
  } catch (error) {
    console.error('Error generating PDF:', error)
    return null
  }
}
