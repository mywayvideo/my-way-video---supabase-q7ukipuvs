import { useLegalSettings } from '@/hooks/use-legal-settings'

export default function ShippingPolicy() {
  const { address, phone, adminEmail } = useLegalSettings()
  const formattedDate = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <main className="min-h-screen pt-32 pb-24 bg-background">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="mb-12 border-b border-border/20 pb-8">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Shipping Policy</h1>
          <p className="text-zinc-500 font-medium">Last Updated: {formattedDate}</p>
        </div>

        <div className="space-y-12 text-zinc-300 leading-relaxed text-lg">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Destinations</h2>
            <p>
              My Way Video successfully ships high-end audiovisual equipment to most major domestic
              and international destinations. Actual availability of shipping methods may vary
              dynamically based on your exact global location and the specific weight/dimensions of
              the equipment ordered. For security reasons, we currently do not ship to standard P.O.
              Boxes or APO/FPO addresses for high-value technological items.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Processing Time (1-3 days)</h2>
            <p>
              All finalized orders are strictly subject to an internal processing, verification, and
              packing time of 1 to 3 business days before they are securely dispatched to the
              carrier. Order processing effectively occurs during normal regional business hours
              (Monday through Friday, excluding major recognized holidays).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. Methods</h2>
            <p>
              We partner heavily with reliable, globally recognized logistics carriers such as
              FedEx, UPS, and DHL to ensure highly secure and timely delivery of your sensitive
              equipment. Available tiered shipping methods (such as Standard Ground, Expedited
              2-Day, or Priority Overnight) will be dynamically presented at checkout based on your
              exact delivery postal code.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Delivery Estimates</h2>
            <p>
              Calculated delivery times are algorithmic estimates provided directly by the carrier
              routing networks and are categorically not guaranteed. Severe external factors such as
              unprecedented weather conditions, localized carrier service delays, global events, and
              complex customs inspections may unfortunately impact the final mile delivery date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Customs/Duties</h2>
            <p>
              For cross-border and intercontinental shipments, the receiving customer is officially
              recognized as the importer of record and must fully comply with all laws,
              restrictions, and regulations of the destination country. Delivered orders may be
              strictly subject to unpredictable import taxes, heavy customs duties, and local
              brokerage fees, all of which are the sole financial responsibility of the customer.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Tracking</h2>
            <p>
              Once your order has been successfully picked up and scanned by the carrier, you will
              promptly receive an automated confirmation email containing a live tracking link. You
              can continually use this specific tracking number to transparently monitor your
              package's physical journey through the carrier's proprietary website tracking portals.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Lost Shipments</h2>
            <p>
              If your official tracking information dictates that your package was delivered but you
              absolutely cannot locate it, or if the package appears to be permanently stuck in
              transit without updates, please contact us immediately so our logistics team can
              formally initiate an exhaustive trace and investigation with the carrier network.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">8. Damage</h2>
            <p>
              If your package arrives visibly crushed, torn, or damaged, please meticulously note
              this explicitly with the carrier driver upon physical delivery signature, and urgently
              contact our dedicated support team within 48 hours. Crucially retain all exterior
              packaging materials and interior padding for immediate carrier photographic inspection
              purposes.
            </p>
          </section>

          <section className="bg-zinc-900/50 p-8 rounded-2xl border border-white/5">
            <h2 className="text-2xl font-bold text-white mb-4">9. Contact</h2>
            <p className="mb-4">
              For intricate shipping-related inquiries, freight quotes, or logistical assistance,
              securely reach out to our team at:
            </p>
            <ul className="space-y-3 text-zinc-400">
              <li className="flex items-center gap-3">
                <span className="text-white font-medium">Email:</span> {adminEmail}
              </li>
              <li className="flex items-center gap-3">
                <span className="text-white font-medium">Phone:</span> {phone}
              </li>
              <li className="flex items-center gap-3">
                <span className="text-white font-medium">Address:</span> {address}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
