import type { GenderIdentity, MapEvent, MapEventMessage, Match, UserProfile } from './types';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

const baseLocation = { lat: -23.5505, lng: -46.6333 };

const photos = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80',
];

export const demoUser = {
  id: 'demo-user',
  email: 'demo@radarmatch.app',
};

export const demoProfile: UserProfile = {
  uid: 'demo-user',
  displayName: 'Você Demo',
  photoURL: photos[1],
  photos: [photos[1], photos[2]],
  location: baseLocation,
  privacyMode: 'nearby',
  visibilityRadius: 500,
  gender: 'man',
  sexualities: ['hetero'],
  lookingFor: ['woman', 'couple'],
  interestedSexualities: [],
  lastSeen: new Date().toISOString(),
  bio: 'Perfil demo para testar o Raddo sem login.',
  isPremium: false,
  likesUsedToday: 0,
  likesQuotaDate: new Date().toISOString().slice(0, 10),
  likesBonus: 0,
  likedByUnlockUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

const names = [
  'Amanda', 'Bianca', 'Carla', 'Dandara', 'Elisa', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Julia',
  'Karen', 'Larissa', 'Marina', 'Natasha', 'Olivia', 'Patricia', 'Raissa', 'Sabrina', 'Tatiana', 'Vanessa',
  'Yasmin', 'Aline', 'Beatriz', 'Camila', 'Daniela', 'Estela', 'Flavia', 'Giovana', 'Heloisa', 'Ingrid',
  'Joana', 'Katia', 'Leticia', 'Manuela', 'Nicole', 'Paula', 'Renata', 'Sara', 'Tais', 'Valeria',
  'Vivian', 'Bruna', 'Cecilia', 'Debora', 'Evelyn', 'Franciele', 'Greice', 'Iara', 'Livia', 'Monica',
];

const sexualities = ['hetero', 'bi', 'pan', 'queer', 'trans', 'lesbian'] as const;

export const demoProfiles: UserProfile[] = names.map((name, index) => {
  const photo = photos[index % photos.length];
  const latOffset = ((index % 10) - 5) * 0.006;
  const lngOffset = ((index % 8) - 4) * 0.006;
  const gender: GenderIdentity = 'woman';

  return {
    uid: `demo-profile-${index + 1}`,
    displayName: `Teste Mulher ${name}`,
    photoURL: photo,
    photos: [photo, photos[(index + 1) % photos.length], photos[(index + 2) % photos.length]],
    location: { lat: baseLocation.lat + latOffset, lng: baseLocation.lng + lngOffset },
    privacyMode: index % 3 === 0 ? 'exact' : 'nearby',
    visibilityRadius: index % 5 === 0 ? 500 : 30 + index,
    gender,
    sexualities: [sexualities[index % sexualities.length]],
    lookingFor: index % 4 === 0 ? ['woman', 'couple'] : ['man', 'woman', 'couple'],
    interestedSexualities: [],
    lastSeen: new Date().toISOString(),
    bio: `Perfil feminino de teste #${index + 1}. Bio variada para testar fotos, curtidas, mapa e match.`,
    isPremium: index % 11 === 0,
    likesUsedToday: 0,
    likesQuotaDate: null,
    likesBonus: 0,
    likedByUnlockUntil: null,
  };
});

export const demoLikedBy = demoProfiles.slice(0, 20);

export const demoMatches: Match[] = demoProfiles.slice(0, 6).map((profile) => ({
  id: ['demo-user', profile.uid].sort().join('_'),
  users: ['demo-user', profile.uid],
  createdAt: new Date().toISOString(),
  lastMessage: 'Match demo criado',
  lastMessageAt: new Date().toISOString(),
}));

export const demoMapEvents: MapEvent[] = [
  {
    id: 'demo-event-1',
    title: 'Happy hour hoje',
    description: 'Pessoas por perto combinando um bar depois do trabalho.',
    coverURL: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=80',
    emoji: '🍻',
    accessMode: 'open',
    passwordHash: '',
    isPermanent: false,
    location: { lat: baseLocation.lat + 0.01, lng: baseLocation.lng - 0.006 },
    radiusKm: 5,
    creatorUid: 'demo-profile-3',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-event-2',
    title: 'Caminhada no parque',
    description: 'Chat local para quem quer caminhar e conhecer gente nova.',
    coverURL: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    emoji: '🌳',
    accessMode: 'approval',
    passwordHash: '',
    isPermanent: false,
    location: { lat: baseLocation.lat - 0.012, lng: baseLocation.lng + 0.008 },
    radiusKm: 3,
    creatorUid: 'demo-profile-8',
    createdAt: new Date().toISOString(),
  },
];

export const demoMapEventMessages: MapEventMessage[] = [
  {
    id: 'demo-event-message-1',
    eventId: 'demo-event-1',
    senderUid: 'demo-profile-3',
    senderName: 'Teste Mulher Carla',
    text: 'Quem esta por perto hoje?',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-event-message-2',
    eventId: 'demo-event-2',
    senderUid: 'demo-profile-8',
    senderName: 'Teste Mulher Helena',
    text: 'Vou estar no parque as 18h.',
    createdAt: new Date().toISOString(),
  },
];
