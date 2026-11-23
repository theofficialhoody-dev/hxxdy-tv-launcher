import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Cinematic TV Launcher',
  description: 'A cinematic, remote-first TV home screen launcher with animated gradients, custom theme studio, and streaming app library.',
  openGraph: {
    title: 'Cinematic TV Launcher',
    description: 'A cinematic, remote-first TV home screen launcher with animated gradients, custom theme studio, and streaming app library.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark bg-black ${geist.variable}`}>
      <body className="overflow-hidden bg-black font-sans antialiased">
        {children}
      </body>
    </html>
  )
}

