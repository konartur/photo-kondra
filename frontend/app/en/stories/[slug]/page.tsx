import { localizedStory, localizedStoryMetadata } from '../../../_portfolio/localized-portfolio';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedStoryMetadata('en', (await params).slug);
}

export default async function Story({ params }: Props) {
  return localizedStory('en', (await params).slug);
}
