import { useLegalSettings } from '@/hooks/use-legal-settings'

export default function RefundPolicy() {
  const { address, phone, adminEmail } = useLegalSettings()
  const formattedDate = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <main className="min-h-screen pt-32 pb-24 bg-background">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="mb-12 border-b border-border/20 pb-8">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Refund Policy</h1>
          <p className="text-zinc-500 font-medium">Last Updated: {formattedDate}</p>
        </div>

        <div className="space-y-12 text-zinc-300 leading-relaxed text-lg">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Return Eligibility (14 days)</h2>
            <p>
              We proudly accept returns of eligible items within 14 days of the original delivery
              date. To be eligible for a successful return, the item must be completely unused, in
              the exact same pristine condition that you received it, and housed in its original
              packaging with all accompanying manuals, cables, and accessories included.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Non-Returnable Items</h2>
            <p>
              Due to industry standards and hygiene/licensing reasons, certain items are strictly
              non-returnable. This includes opened software, digital downloads, specialized
              custom-configured equipment, special orders, and items distinctly marked as final
              sale. Gift cards and consumable items (such as batteries or specific storage media)
              are also categorically exempt from returns.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. Authorization</h2>
            <p>
              All standard returns require an officially authorized Return Merchandise Authorization
              (RMA) number. Please contact our support team to smoothly initiate a return process.
              Packages sent to our facilities without a valid, clearly visible RMA number will be
              automatically rejected and returned directly to the sender at their expense.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Refund Processing (5-15 days)</h2>
            <p>
              Once our technicians physically receive and extensively inspect your returned item, we
              will formally notify you via email regarding the approval or rejection of your refund.
              Approved refunds will be automatically processed back to your original method of
              payment within 5 to 15 business days, varying significantly depending on your
              financial institution's processing cycles.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Shipping Charges</h2>
            <p>
              Original outbound shipping charges are fundamentally non-refundable. You will be
              entirely responsible for paying your own tracked shipping costs for returning your
              item, unless the return is a direct result of our logistical error (for instance, if
              you received an incorrect model or a visibly defective out-of-box item).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Damaged Products</h2>
            <p>
              If you receive a product that was structurally damaged during carrier transit, you
              must report it to us within 48 hours of confirmed delivery. You must retain all
              original shipping packaging, bubble wrap, and contents, as they will be strictly
              required for subsequent carrier inspection protocols and insurance claims.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. International Orders</h2>
            <p>
              For international orders outside our standard zones, customers are wholly responsible
              for any return shipping logistics and costs, as well as absorbing any applicable
              import duties, local taxes, and courier clearance fees. Authorized returns from
              outside our primary operating regions may be subject to additional standard restocking
              fees to cover processing overhead.
            </p>
          </section>

          <section className="bg-zinc-900/50 p-8 rounded-2xl border border-white/5">
            <h2 className="text-2xl font-bold text-white mb-4">8. Contact</h2>
            <p className="mb-4">
              To effectively request a return authorization or inquire further about our
              comprehensive Refund Policy, please reach out to us at:
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
