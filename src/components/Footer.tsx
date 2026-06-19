import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { MapPin, Mail, Instagram, Facebook, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export function Footer() {
  const [aboutContent, setAboutContent] = useState('')
  const [address, setAddress] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [socialIg, setSocialIg] = useState('')
  const [socialFb, setSocialFb] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFooterData() {
      try {
        const [companyInfoRes, appSettingsRes] = await Promise.all([
          supabase.from('company_info').select('content').eq('type', 'footer_about').maybeSingle(),
          supabase
            .from('app_settings')
            .select('setting_key, setting_value')
            .in('setting_key', [
              'company_address',
              'company_whatsapp',
              'company_email',
              'social_instagram',
              'social_facebook',
            ]),
        ])

        if (companyInfoRes.data?.content) {
          setAboutContent(companyInfoRes.data.content)
        } else {
          setAboutContent(
            'Inteligência em Audiovisual PRO. Elevando o padrão das produções audiovisuais com tecnologia de ponta e suporte especializado.',
          )
        }

        if (appSettingsRes.data) {
          appSettingsRes.data.forEach((setting) => {
            if (setting.setting_key === 'company_address') setAddress(setting.setting_value)
            if (setting.setting_key === 'company_whatsapp') setWhatsapp(setting.setting_value)
            if (setting.setting_key === 'company_email') setEmail(setting.setting_value)
            if (setting.setting_key === 'social_instagram') setSocialIg(setting.setting_value)
            if (setting.setting_key === 'social_facebook') setSocialFb(setting.setting_value)
          })
        }
      } catch (error) {
        console.error('Error fetching footer data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchFooterData()
  }, [])

  const igLink = socialIg || 'https://www.instagram.com/mywayvideopro/'
  const fbLink = socialFb || 'https://www.facebook.com/MyWayVideoPro'

  return (
    <footer className="mt-auto relative bg-[#0a0a0a] text-white pt-24 pb-8 overflow-hidden border-t border-white/10 selection:bg-white selection:text-black">
      <div className="container mx-auto px-6 lg:px-12 relative z-10">
        {/* Asymmetric Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 lg:gap-8 mb-32">
          {/* Brand & About (Takes 5 cols) */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold tracking-widest uppercase text-zinc-300">
                  Available worldwide
                </span>
              </div>

              <h3 className="text-3xl lg:text-4xl font-black tracking-tighter text-white mb-6 leading-tight">
                Eleve o Nível do seu
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-500 to-zinc-100">
                  Audiovisual
                </span>
              </h3>

              {loading ? (
                <div className="space-y-3 animate-pulse max-w-sm">
                  <div className="h-4 bg-white/10 rounded w-full"></div>
                  <div className="h-4 bg-white/10 rounded w-5/6"></div>
                </div>
              ) : (
                <p className="text-zinc-400 font-medium text-lg leading-relaxed max-w-md">
                  {aboutContent}
                </p>
              )}
            </div>

            <div className="flex gap-4 mt-12">
              <a
                href={igLink}
                target="_blank"
                rel="noreferrer"
                className="group relative flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 hover:bg-white hover:text-black transition-all duration-500 hover:scale-105 hover:-translate-y-1 overflow-hidden"
                aria-label="Instagram"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <Instagram
                  size={22}
                  className="relative z-10 group-hover:text-white transition-colors"
                />
              </a>
              <a
                href={fbLink}
                target="_blank"
                rel="noreferrer"
                className="group relative flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 hover:bg-[#1877F2] hover:text-white transition-all duration-500 hover:scale-105 hover:-translate-y-1 overflow-hidden"
                aria-label="Facebook"
              >
                <Facebook size={22} className="relative z-10" />
              </a>
            </div>
          </div>

          {/* Links Grid (Takes 7 cols) */}
          <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-12 lg:gap-8 lg:pl-16">
            {/* Quick Links */}
            <div className="space-y-8">
              <h4 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase">
                Explore
              </h4>
              <nav className="flex flex-col gap-5">
                {[
                  { name: 'Favorites', path: '/favorites' },
                  { name: 'Home', path: '/' },
                ].map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    onClick={() => window.scrollTo(0, 0)}
                    className="group flex items-center text-zinc-300 font-medium text-lg hover:text-white transition-all duration-300 w-fit"
                  >
                    <span className="relative">
                      {link.name}
                      <span className="absolute -bottom-1 left-0 w-0 h-px bg-white transition-all duration-300 group-hover:w-full"></span>
                    </span>
                    <ArrowUpRight className="w-4 h-4 ml-2 opacity-0 -translate-x-2 translate-y-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-300" />
                  </Link>
                ))}
              </nav>

              <div className="pt-6">
                <h4 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase mb-6">
                  Legal
                </h4>
                <nav className="flex flex-col gap-4">
                  {[
                    { name: 'Privacy Policy', path: '/privacy-policy' },
                    { name: 'Terms of Service', path: '/terms-of-service' },
                    { name: 'Refund Policy', path: '/refund-policy' },
                    { name: 'Shipping Policy', path: '/shipping-policy' },
                  ].map((link) => (
                    <Link
                      key={link.name}
                      to={link.path}
                      onClick={() => window.scrollTo(0, 0)}
                      className="text-zinc-400 hover:text-zinc-100 transition-colors duration-300 w-fit"
                    >
                      {link.name}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-8">
              <h4 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase">
                Contact
              </h4>
              <div className="space-y-6 text-zinc-300 font-medium">
                {loading ? (
                  <div className="space-y-6 animate-pulse">
                    <div className="h-5 bg-white/10 rounded w-3/4"></div>
                    <div className="h-5 bg-white/10 rounded w-1/2"></div>
                    <div className="h-5 bg-white/10 rounded w-2/3"></div>
                  </div>
                ) : (
                  <>
                    {address && (
                      <div className="group flex items-start gap-4">
                        <div className="mt-1 flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 group-hover:bg-white group-hover:text-black transition-all duration-300 shrink-0">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <span className="leading-relaxed text-zinc-400 group-hover:text-zinc-200 transition-colors duration-300">
                          {address}
                        </span>
                      </div>
                    )}
                    {whatsapp && (
                      <div className="group flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 group-hover:bg-[#25D366] group-hover:text-white group-hover:border-[#25D366] transition-all duration-300 shrink-0">
                          <WhatsAppIcon className="w-4 h-4" />
                        </div>
                        <span className="text-zinc-400 group-hover:text-zinc-200 transition-colors duration-300">
                          {whatsapp}
                        </span>
                      </div>
                    )}
                    {email && (
                      <div className="group flex items-center gap-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 group-hover:bg-white group-hover:text-black transition-all duration-300 shrink-0">
                          <Mail className="w-4 h-4" />
                        </div>
                        <span className="text-zinc-400 group-hover:text-zinc-200 transition-colors duration-300">
                          {email}
                        </span>
                      </div>
                    )}
                    {!address && !whatsapp && !email && (
                      <p className="italic text-zinc-600">Information not available.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Massive Typography */}
      <div className="relative w-full border-t border-white/5 pt-12 mt-12 overflow-hidden flex flex-col items-center">
        <h2 className="text-[clamp(2.5rem,12vw,15rem)] font-black tracking-[-0.04em] leading-none text-center select-none text-white/40 pointer-events-none pb-12 w-full px-4 overflow-visible">
          MY WAY VIDEO
        </h2>

        {/* Bottom Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest w-full">
          <p>© {new Date().getFullYear()} My Way Video. All rights reserved.</p>
          <div className="flex gap-8">
            <Link
              to="/privacy-policy"
              onClick={() => window.scrollTo(0, 0)}
              className="hover:text-white transition-colors duration-300"
            >
              Privacy
            </Link>
            <Link
              to="/terms-of-service"
              onClick={() => window.scrollTo(0, 0)}
              className="hover:text-white transition-colors duration-300"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
