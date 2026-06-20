import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export type ImagePickerSource = 'camera' | 'gallery';

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export async function pickNativeImage(source: ImagePickerSource) {
  const photo = await Camera.getPhoto({
    allowEditing: false,
    correctOrientation: true,
    quality: 82,
    resultType: CameraResultType.Uri,
    saveToGallery: false,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
  });

  if (!photo.webPath) throw new Error('Não consegui acessar a imagem selecionada.');

  const response = await fetch(photo.webPath);
  if (!response.ok) throw new Error('Não consegui abrir a imagem selecionada.');
  const blob = await response.blob();
  const mimeType = blob.type || photo.format && `image/${photo.format}` || 'image/jpeg';
  return new File([blob], `chat-cover-${Date.now()}.${extensionForMimeType(mimeType)}`, { type: mimeType });
}
