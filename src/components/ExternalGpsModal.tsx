import { MapPin, Navigation, X } from 'lucide-react';
import type { LatLng } from '../types';

type Props = {
  location: LatLng;
  title: string;
  onClose: () => void;
};

function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ExternalGpsModal({ location, onClose, title }: Props) {
  const encodedTitle = encodeURIComponent(title);
  const query = `${location.lat},${location.lng}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodedTitle}`;
  const wazeUrl = `https://waze.com/ul?ll=${query}&navigate=yes`;
  const geoUrl = `geo:${query}?q=${query}(${encodedTitle})`;

  return (
    <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#07111f] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-teal-300 text-slate-950">
              <MapPin className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold">Abrir localização</h2>
            <p className="mt-1 text-sm text-slate-300">
              Abrir o local de {title} em um app externo de GPS?
            </p>
          </div>
          <button
            aria-label="Fechar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/8"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-2">
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-300 text-sm font-semibold text-slate-950"
            onClick={() => openExternalUrl(googleMapsUrl)}
            type="button"
          >
            <Navigation className="h-4 w-4" />
            Abrir no Google Maps
          </button>
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 text-sm font-semibold text-slate-100"
            onClick={() => openExternalUrl(wazeUrl)}
            type="button"
          >
            <Navigation className="h-4 w-4" />
            Abrir no Waze
          </button>
          <button
            className="h-10 rounded-lg border border-white/10 bg-white/8 text-xs font-semibold text-slate-300"
            onClick={() => openExternalUrl(geoUrl)}
            type="button"
          >
            Escolher outro app de GPS
          </button>
        </div>
      </section>
    </div>
  );
}

