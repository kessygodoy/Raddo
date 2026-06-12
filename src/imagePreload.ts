const preloadedImages = new Map<string, HTMLImageElement>();

export function preloadImage(url: string) {
  if (!url || preloadedImages.has(url)) return;

  const image = new Image();
  preloadedImages.set(url, image);
  image.src = url;
}

export function preloadImages(urls: string[]) {
  urls.filter(Boolean).forEach(preloadImage);
}

export function profileCoverUrl(profile: { photoURL: string; photos: string[] }) {
  return profile.photos.find(Boolean) || profile.photoURL;
}
