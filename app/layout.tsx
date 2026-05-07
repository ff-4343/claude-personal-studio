import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Claude Studio', description: 'Your personal Claude AI' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>
}
