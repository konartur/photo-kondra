import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { PortfolioMotion } from './portfolio-motion';
import styles from './portfolio.module.css';

const inter = localFont({
  src: './InterVariable.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--portfolio-font',
});

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return (
    <PortfolioMotion className={`${styles.portfolio} ${inter.variable}`}>
      {children}
    </PortfolioMotion>
  );
}
