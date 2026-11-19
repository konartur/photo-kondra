import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ThemeToggle } from './theme-toggle';
import { themeInitializationScript } from '@/lib/theme';
import { portfolioViewportInitializationScript } from '@/lib/portfolio-viewport';

export const metadata: Metadata = {
  title: 'Photo Cloud',
  description: 'Private photo delivery for photographers',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
        <script dangerouslySetInnerHTML={{ __html: portfolioViewportInitializationScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <ThemeToggle className="global-theme-toggle" />
        </Providers>
      </body>
    </html>
  );
}
