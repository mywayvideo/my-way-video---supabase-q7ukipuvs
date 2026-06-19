import { useLegalSettings } from '@/hooks/use-legal-settings'

export default function TermsOfService() {
  const { address, phone, adminEmail } = useLegalSettings()
  const formattedDate = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <main className="min-h-screen pt-32 pb-24 bg-background">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="mb-12 border-b border-border/20 pb-8">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Terms of Service</h1>
          <p className="text-zinc-500 font-medium">Last Updated: {formattedDate}</p>
        </div>

        <div className="space-y-12 text-zinc-300 leading-relaxed text-lg">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance</h2>
            <p>
              By accessing and using the My Way Video website and services, you acknowledge that you
              have read, understood, and agree to be fully bound by these Terms of Service. If you
              do not agree with any part of these terms, you must not use our website or purchase
              our products.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Products/Services</h2>
            <p>
              We provide high-quality audiovisual equipment and related technical services. All
              descriptions, images, specifications, and prices of products are subject to change at
              any time without notice. We continuously strive for accuracy, but we reserve the right
              to modify or discontinue any product or service at our discretion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. Orders</h2>
            <p>
              All orders placed through our platform are subject to our formal acceptance. We
              reserve the right to refuse, limit, or completely cancel any order for reasons
              including, but not limited to, inventory unavailability, identified errors in product
              or pricing information, or suspicions of fraudulent activity.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Pricing</h2>
            <p>
              Prices are presented in the applicable currency and generally do not include shipping
              costs or local taxes unless explicitly stated otherwise. Final cumulative costs,
              including any applicable taxes and shipping fees, will be clearly calculated and
              displayed before final checkout completion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Account Responsibility</h2>
            <p>
              If you create an account, you assume full responsibility for maintaining the
              confidentiality of your login credentials and for all activities that occur under your
              account perimeter. You must notify us immediately of any unauthorized use or security
              breaches.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Warranty</h2>
            <p>
              Products typically include a standard manufacturer's warranty. My Way Video operates
              primarily as a distributor and makes no additional warranties, express or implied,
              regarding the products beyond what is explicitly stated in the accompanying product
              documentation and manufacturer guarantees.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Limitation of Liability</h2>
            <p>
              In no event shall My Way Video, its directors, employees, or affiliates be liable for
              any indirect, incidental, special, punitive, or consequential damages arising out of
              or related to your use of our products, services, or website, even if specifically
              advised of the possibility of such damages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">8. Intellectual Property</h2>
            <p>
              All structured content on this site, including but not limited to text, graphics,
              logos, images, digital downloads, and data compilations, is the exclusive property of
              My Way Video or its respective content suppliers and is protected by comprehensive
              intellectual property laws. You may not reproduce it without explicit written
              permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">9. Governing Law</h2>
            <p>
              These Terms of Service and any separate overarching agreements whereby we provide you
              services shall be governed by and consistently construed in accordance with the
              applicable regional laws of the jurisdiction in which My Way Video officially
              operates, bypassing conflict of law principles.
            </p>
          </section>

          <section className="bg-zinc-900/50 p-8 rounded-2xl border border-white/5">
            <h2 className="text-2xl font-bold text-white mb-4">10. Contact</h2>
            <p className="mb-4">
              If you have any questions or require clarifications regarding these Terms of Service,
              please contact us at:
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
