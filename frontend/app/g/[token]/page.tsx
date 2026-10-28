import { PublicGalleryPage } from './public-gallery';

interface PublicGalleryRouteProps {
  params: Promise<{ token: string }>;
}

export default async function GalleryRoute({ params }: PublicGalleryRouteProps) {
  const { token } = await params;
  return <PublicGalleryPage token={token} />;
}
