import { useLegalSettings } from '@/hooks/use-legal-settings'

export default function PrivacyPolicy() {
  const { address, phone, adminEmail } = useLegalSettings()
  const formattedDate = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <main className="min-h-screen pt-32 pb-24 bg-background">
      <div className="container mx-auto px-6 max-w-4xl">
        <div className="mb-12 border-b border-border/20 pb-8">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-zinc-500 font-medium">Last Updated: {formattedDate}</p>
        </div>

        <div className="space-y-12 text-zinc-300 leading-relaxed text-lg">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
            <p>
              Welcome to My Way Video. We value your privacy and are committed to protecting your
              personal data. This Privacy Policy explains how we collect, use, and safeguard your
              information when you visit our website or purchase our products.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. Information Collection</h2>
            <p>
              We may collect personal information such as your name, email address, phone number,
              shipping address, and payment details when you create an account, place an order, or
              contact us. We also automatically collect non-personal data like IP addresses and
              browsing behavior to enhance user experience.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. Usage</h2>
            <p>
              Your information is used to process orders, deliver products, communicate with you
              regarding your purchases, provide customer support, and improve our overall services.
              We may also use your email to send promotional offers, which you can opt out of at any
              time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Sharing</h2>
            <p>
              We do not sell your personal data. We may share your information with trusted
              third-party service providers (such as payment processors and shipping partners)
              strictly necessary to fulfill your orders and operate our business securely. All third
              parties are legally obligated to keep your information confidential.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. International Transfers</h2>
            <p>
              Your information may be transferred to and maintained on servers located outside of
              your state, province, country, or other governmental jurisdiction where data
              protection laws may differ. By using our services, you formally consent to this
              international transfer.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Security</h2>
            <p>
              We implement robust, industry-standard security measures to protect your personal
              information. However, please note that no method of transmission over the Internet or
              electronic storage is 100% secure, and we cannot guarantee absolute security against
              highly sophisticated attacks.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Cookies</h2>
            <p>
              We use cookies and similar tracking technologies to enhance your browsing experience,
              seamlessly maintain your session, analyze site traffic, and understand user
              interactions. You can manage or disable your cookie preferences directly through your
              browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">8. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you have the right to access, update, correct, or
              delete your personal information. You can also object to our processing of your data
              or request data portability. To exercise these rights, please contact us directly
              using the information below.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">9. Children's Privacy</h2>
            <p>
              Our services and products are not intended for children under 13 years of age. We do
              not knowingly collect personal information from children. If we discover that a minor
              has provided us with personal data, we will securely delete it immediately.
            </p>
          </section>

          <section className="bg-zinc-900/50 p-8 rounded-2xl border border-white/5">
            <h2 className="text-2xl font-bold text-white mb-4">10. Contact</h2>
            <p className="mb-4">
              If you have any questions, concerns, or requests regarding this Privacy Policy, please
              contact our administrative team at:
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
