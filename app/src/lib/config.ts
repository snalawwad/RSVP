// App settings. Values come from app/.env (EXPO_PUBLIC_* are bundled into the app,
// so only public values belong there: never the Supabase secret/service key).
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  siteUrl: (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://snalawwad.github.io/RSVP').replace(/\/$/, ''),
  supportWhatsApp: process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '',
  /** log in with a phone number and a WhatsApp code (on once the WhatsApp code hook is switched on); else email code */
  loginPhone: process.env.EXPO_PUBLIC_LOGIN_PHONE === 'true',
  /** the sample-data demo (demo/app): its pretend server takes any login, so Log in goes straight in as the sample host */
  demo: /^https:\/\/mock\.supabase\.test/.test(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseKey);

export const links = {
  privacy: (lang: string) => `${config.siteUrl}/privacy.html?lang=${lang}`,
  support: (lang: string) => `${config.siteUrl}/support.html?lang=${lang}`,
  terms: (lang: string) => `${config.siteUrl}/terms.html?lang=${lang}`,
  about: (lang: string) => `${config.siteUrl}/index.html?lang=${lang}#how`,
  whatsapp: (text: string) =>
    /^\d{8,15}$/.test(config.supportWhatsApp) ? `https://wa.me/${config.supportWhatsApp}?text=${encodeURIComponent(text)}` : null,
};
