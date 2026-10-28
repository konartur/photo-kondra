import { GalleryDetail } from './gallery-detail';

interface GalleryDetailPageProps {
  params: Promise<{ galleryId: string }>;
}

export default async function GalleryDetailPage({ params }: GalleryDetailPageProps) {
  const { galleryId } = await params;
  return <GalleryDetail galleryId={galleryId} />;
}
