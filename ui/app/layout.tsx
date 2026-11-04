import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '../components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Watchstander Copilot',
  description: 'Offline casualty control copilot for the engineering watchstander. Training use only.',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Runs before paint to set the theme and red-light classes, preventing a bright flash
// on a darkened watch station.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var r=document.documentElement;var saved=localStorage.getItem('theme');var dark=saved?saved==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;r.classList.toggle('dark',dark);r.classList.toggle('redlight',localStorage.getItem('redlight')==='1');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <div className="banner" role="note">
          TRAINING USE ONLY. Public unclassified and synthetic doctrine. Not for operational use.
        </div>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
