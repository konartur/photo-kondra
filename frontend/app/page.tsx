import type { Metadata, Viewport } from 'next';
import { PortfolioHome } from './_portfolio/portfolio-home';
import PortfolioLayout from './_portfolio/portfolio-layout';

export const metadata: Metadata = {
  title: 'Invisible Gallery — Photography',
  description: 'Invisible Gallery — авторське портфоліо фотографа. Ваші історії в кадрах.',
};

export const viewport: Viewport = { themeColor: '#F7F7F4', viewportFit: 'cover' };

export default function Home() {
  return (
    <PortfolioLayout>
      <PortfolioHome />
    </PortfolioLayout>
  );
}
