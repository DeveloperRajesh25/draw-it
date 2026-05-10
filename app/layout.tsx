import type { Metadata, Viewport } from 'next';
import { Caveat, DM_Sans } from 'next/font/google';
import './globals.css';

const display = Caveat({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Draw It — multiplayer pictionary that survives a refresh',
  description:
    'A drawing-and-guessing party game with a serious answer to the mobile-tab-killing problem: rooms persist, players reconnect.',
  applicationName: 'Draw It',
  appleWebApp: { capable: true, title: 'Draw It', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f7f1e3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
