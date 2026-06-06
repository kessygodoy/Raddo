export type PrivacyMode = 'exact' | 'nearby';
export type AppView = 'radar' | 'discover' | 'chat' | 'profile' | 'notifications';
export type AppTheme = 'dark' | 'light' | 'pride' | 'system';
export type ResolvedAppTheme = 'dark' | 'light' | 'pride';
export type AppLanguage = 'pt-BR' | 'en-US' | 'es';
export type MapEventAccessMode = 'open' | 'approval' | 'password';

export type GenderIdentity = 'man' | 'woman' | 'couple' | 'nonbinary' | 'trans' | 'other' | 'prefer_not_to_say';
export type ProfileInterest = 'games' | 'gym' | 'anime' | 'technology' | 'music' | 'travel' | 'cars' | 'pets';
export type RelationshipGoal = 'dating' | 'friendship' | 'chat' | 'casual';

export type Sexuality =
  | 'hetero'
  | 'gay'
  | 'lesbian'
  | 'bi'
  | 'pan'
  | 'trans'
  | 'nonbinary'
  | 'queer'
  | 'asexual'
  | 'demisexual'
  | 'other';

export type LatLng = {
  lat: number;
  lng: number;
};

export type UserProfile = {
  uid: string;
  displayName: string;
  photoURL: string;
  photos: string[];
  location: LatLng | null;
  privacyMode: PrivacyMode;
  appearInCards: boolean;
  showDistance: boolean;
  showOnlineStatus: boolean;
  visibilityRadius: number;
  age: number;
  gender: GenderIdentity;
  genderIdentities: GenderIdentity[];
  sexualities: Sexuality[];
  lookingFor: GenderIdentity[];
  interestedSexualities: Sexuality[];
  interests: ProfileInterest[];
  relationshipGoals: RelationshipGoal[];
  minAgePreference?: number;
  maxAgePreference?: number;
  lastSeen: string | null;
  bio: string;
  isPremium: boolean;
  likesUsedToday: number;
  likesQuotaDate: string | null;
  likesBonus: number;
  likedByUnlockUntil: string | null;
  createdAt?: string | null;
};

export type Like = {
  fromUid: string;
  toUid: string;
  createdAt: string;
};

export type Match = {
  id: string;
  users: string[];
  createdAt: string;
  lastMessage: string;
  lastMessageAt: string | null;
};

export type Message = {
  id: string;
  senderUid: string;
  text: string;
  matchId: string;
  messageType: 'image' | 'text';
  imageURL: string;
  imagePath: string;
  viewOnce: boolean;
  viewedBy: string[];
  createdAt: string;
};

export type MapEvent = {
  id: string;
  title: string;
  description: string;
  coverURL: string;
  emoji: string;
  accessMode: MapEventAccessMode;
  passwordHash: string;
  isPermanent: boolean;
  location: LatLng;
  radiusKm: number;
  creatorUid: string;
  createdAt: string;
};

export type MapEventMessage = {
  id: string;
  eventId: string;
  senderUid: string;
  senderName: string;
  text: string;
  messageType: 'image' | 'text';
  imageURL: string;
  imagePath: string;
  viewOnce: boolean;
  viewedBy: string[];
  createdAt: string;
};

export type GenderFilter = GenderIdentity[];
