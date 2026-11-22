import type { Viewport } from 'next';
import { localizedHome, localizedHomeMetadata } from '../_portfolio/localized-portfolio';

export const viewport: Viewport = { themeColor: '#F7F7F4', viewportFit: 'cover' };
export const generateMetadata = () => localizedHomeMetadata('uk');

export default function Home() {
  return localizedHome('uk');
}
