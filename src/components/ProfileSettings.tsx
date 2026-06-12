import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  Car,
  Dumbbell,
  Eye,
  FileText,
  Gamepad2,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquareWarning,
  Music,
  Palette,
  PawPrint,
  Plane,
  Play,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  UserRound,
  UserX,
  X,
} from 'lucide-react';
import {
  formatGender,
  formatInterest,
  formatRadius,
  formatRelationshipGoal,
  formatSexuality,
  genderOptions,
  interestOptions,
  relationshipGoalOptions,
  sexualityOptions,
} from '../profileOptions';
import { isDemoMode } from '../demoData';
import { deleteMyAccount } from '../accountDeletion';
import { languageOptions, useI18n } from '../i18n';
import { supabase } from '../supabase';
import type { AppLanguage, AppTheme, GenderIdentity, ProfileInterest, RelationshipGoal, Sexuality, UserProfile } from '../types';
import { unblockProfile, undoProfileInteraction, useBlockedProfiles, useProfileInteractions } from '../hooks/useMatches';
import PremiumScreen from './PremiumScreen';
import ProfilePreview from './ProfilePreview';
import { getNotificationPermission, requestNativeNotifications, showAppNotification } from '../nativeNotifications';
import { registerDeviceForPush } from '../pushNotifications';
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
  saveNotificationPreferencesLocal,
  syncNotificationPreferences,
  type NotificationPreferences,
} from '../notificationPreferences';
import { moderateUploadedImage } from '../imageModeration';
import { uploadProfilePhoto as uploadProfilePhotoToStorage } from '../storageImages';
import {
  banAppUser,
  type ModerationCase,
  unbanAppUser,
  useAppBannedUsers,
  useAppModeratorRole,
  useModerationCases,
  useModerationDashboard,
} from '../moderation';
import { showRewardedVideoAd } from '../adMob';

type Props = {
  profile: UserProfile;
  currentTheme: AppTheme;
  currentLanguage: AppLanguage;
  setTheme: (theme: AppTheme) => void;
  setLanguage: (language: AppLanguage) => void;
};

const themeOptions: Array<{ value: AppTheme; label: string }> = [
  { value: 'system', label: 'systemTheme' },
  { value: 'dark', label: 'darkTheme' },
  { value: 'light', label: 'lightTheme' },
  { value: 'green', label: 'greenTheme' },
  { value: 'pride', label: 'colorfulTheme' },
];

type SettingsSection = 'profile' | 'gender' | 'interactions' | 'theme' | 'premium' | 'safety';
type PreferenceStep = 'find' | 'identity';

const settingsSections: Array<{ value: SettingsSection; label: string }> = [
  { value: 'profile', label: 'profileTab' },
  { value: 'gender', label: 'preferencesTab' },
  { value: 'interactions', label: 'Interações' },
  { value: 'theme', label: 'themeTab' },
  { value: 'premium', label: 'premiumTab' },
  { value: 'safety', label: 'safetyTab' },
];

const BIO_MAX_LENGTH = 300;
const CAROUSEL_PHOTO_MAX = 10;
const GALLERY_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

export default function ProfileSettings({ currentLanguage, currentTheme, profile, setLanguage, setTheme }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ ...profile, bio: profile.bio.slice(0, BIO_MAX_LENGTH) });
  const [saveStatus, setSaveStatus] = useState(t('savedAutomatically'));
  const [hasProfileChanges, setHasProfileChanges] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [uploadingCarouselPhotos, setUploadingCarouselPhotos] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [preferenceStep, setPreferenceStep] = useState<PreferenceStep>('find');
  const [preferenceSearch, setPreferenceSearch] = useState('');
  const [showPublicPreview, setShowPublicPreview] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState(
    typeof Notification === 'undefined' ? 'indisponível' : Notification.permission,
  );
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(() => loadNotificationPreferences(profile.uid));
  const [safetyMessage, setSafetyMessage] = useState('');
  const [banUserUid, setBanUserUid] = useState('');
  const [banReason, setBanReason] = useState('');
  const [selectedModerationCase, setSelectedModerationCase] = useState<ModerationCase | null>(null);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [moderationTab, setModerationTab] = useState<'reports' | 'bans'>('reports');
  const [termsOpen, setTermsOpen] = useState(false);
  const [interactionsMessage, setInteractionsMessage] = useState('');
  const [interactionsAdOpen, setInteractionsAdOpen] = useState(false);
  const [interactionsUnlockUntil, setInteractionsUnlockUntil] = useState(() => {
    const saved = window.localStorage.getItem(`raddo-interactions-unlock-until:${profile.uid}`);
    return saved ? Number(saved) : 0;
  });
  const [deletingAccount, setDeletingAccount] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const saveVersionRef = useRef(0);
  const latestDraftRef = useRef(profile);
  const blockedProfiles = useBlockedProfiles(profile.uid);
  const interactions = useProfileInteractions(profile.uid);
  const interactionsUnlocked = profile.isPremium || interactionsUnlockUntil > Date.now();
  const interactionUnlockMinutes = Math.max(0, Math.ceil((interactionsUnlockUntil - Date.now()) / 60000));
  const appModeratorRole = useAppModeratorRole(profile.uid);
  const moderationCases = useModerationCases(Boolean(appModeratorRole));
  const moderationDashboard = useModerationDashboard(Boolean(appModeratorRole));
  const appBannedUsers = useAppBannedUsers(Boolean(appModeratorRole));

  useEffect(() => {
    getNotificationPermission().then(setNotificationStatus);
  }, []);

  useEffect(() => {
    const nextProfile = { ...profile, bio: profile.bio.slice(0, BIO_MAX_LENGTH) };
    setDraft(nextProfile);
    latestDraftRef.current = nextProfile;
    saveVersionRef.current += 1;
    setHasProfileChanges(false);
    setNotificationPreferences(loadNotificationPreferences(profile.uid));
    const savedInteractionsUnlock = window.localStorage.getItem(`raddo-interactions-unlock-until:${profile.uid}`);
    setInteractionsUnlockUntil(savedInteractionsUnlock ? Number(savedInteractionsUnlock) : 0);
  }, [profile]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        void saveProfile(latestDraftRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const handleBack = (event: Event) => {
      if (showPublicPreview) {
        event.preventDefault();
        setShowPublicPreview(false);
        return;
      }

      if (selectedModerationCase) {
        event.preventDefault();
        setSelectedModerationCase(null);
        return;
      }

      if (moderationOpen) {
        event.preventDefault();
        setModerationOpen(false);
        return;
      }

      if (termsOpen) {
        event.preventDefault();
        setTermsOpen(false);
      }
    };

    window.addEventListener('raddo:android-back', handleBack);

    return () => {
      window.removeEventListener('raddo:android-back', handleBack);
    };
  }, [moderationOpen, selectedModerationCase, showPublicPreview, termsOpen]);

  function updateDraft<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft((prev) => {
      const nextDraft = { ...prev, [key]: value };
      queueAutoSave(nextDraft);
      return nextDraft;
    });
  }

  function updateDraftPatch(patch: Partial<UserProfile>) {
    setDraft((prev) => {
      const nextDraft = { ...prev, ...patch };
      queueAutoSave(nextDraft);
      return nextDraft;
    });
  }

  function toggleArrayValue<T extends string>(values: T[], value: T, checked: boolean) {
    return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
  }

  function limitedInterests(values: ProfileInterest[], value: ProfileInterest, checked: boolean) {
    const next = toggleArrayValue(values, value, checked);
    return next.slice(0, 8);
  }

  function primaryGender(values: GenderIdentity[]) {
    return values.find((value) => value === 'man' || value === 'woman' || value === 'couple') ?? 'man';
  }

  async function uploadFile(file: File, context: 'profile-carousel' | 'profile-photo') {
    if (isDemoMode) return URL.createObjectURL(file);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${profile.uid}/${Date.now()}-${safeName}`;
    const signedUrl = await uploadProfilePhotoToStorage(path, file);
    await moderateUploadedImage({ context, path, publicUrl: signedUrl });
    return signedUrl;
  }

  async function uploadProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingProfilePhoto(true);
    try {
      const uploadedUrl = await uploadFile(file, 'profile-photo');
      if (uploadedUrl) {
        const nextDraft = { ...latestDraftRef.current, photoURL: uploadedUrl };
        setDraft(nextDraft);
        const saveVersion = markProfileChanged(nextDraft);
        await saveDraftNow(nextDraft, saveVersion);
      }
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Não consegui verificar a imagem.');
    }
    setUploadingProfilePhoto(false);
    event.target.value = '';
  }

  async function uploadCarouselPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setUploadingCarouselPhotos(true);
    const uploadedUrls: string[] = [];

    for (const file of files) {
      try {
        const uploadedUrl = await uploadFile(file, 'profile-carousel');
        if (uploadedUrl) uploadedUrls.push(uploadedUrl);
      } catch (error) {
        setSaveStatus(error instanceof Error ? error.message : 'Não consegui verificar uma imagem.');
      }
    }

    if (uploadedUrls.length > 0) {
      const nextPhotos = [...draft.photos, ...uploadedUrls].slice(0, CAROUSEL_PHOTO_MAX);
      const nextDraft = { ...latestDraftRef.current, photos: nextPhotos };
      setDraft(nextDraft);
      const saveVersion = markProfileChanged(nextDraft);
      await saveDraftNow(nextDraft, saveVersion);
    }

    setUploadingCarouselPhotos(false);
    event.target.value = '';
  }

  function removePhoto(photo: string) {
    updateDraft(
      'photos',
      draft.photos.filter((item) => item !== photo),
    );
  }

  async function saveProfile(nextDraft: UserProfile, successKey: 'savedAutomatically' | 'savedManually' = 'savedAutomatically') {
    if (isDemoMode) {
      setSaveStatus(t(successKey));
      return true;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: nextDraft.displayName,
        photo_url: nextDraft.photoURL || '',
        photos: nextDraft.photos,
        privacy_mode: nextDraft.privacyMode,
        appear_in_cards: nextDraft.appearInCards,
        show_distance: nextDraft.showDistance,
        show_online_status: nextDraft.showOnlineStatus,
        visibility_radius: nextDraft.visibilityRadius,
        age: nextDraft.age ?? 18,
        gender: primaryGender(nextDraft.genderIdentities.length ? nextDraft.genderIdentities : [nextDraft.gender]),
        gender_identities: nextDraft.genderIdentities.length ? nextDraft.genderIdentities : [nextDraft.gender],
        sexualities: nextDraft.sexualities,
        looking_for: nextDraft.lookingFor,
        interested_sexualities: nextDraft.interestedSexualities,
        interests: nextDraft.interests,
        relationship_goals: nextDraft.relationshipGoals,
        min_age_preference: nextDraft.minAgePreference ?? 18,
        max_age_preference: nextDraft.maxAgePreference ?? 60,
        bio: nextDraft.bio.slice(0, BIO_MAX_LENGTH),
        is_premium: nextDraft.isPremium,
        last_seen: new Date().toISOString(),
      })
      .eq('id', profile.uid);

    setSaveStatus(error ? t('savedError', { message: error.message }) : t(successKey));
    return !error;
  }

  function markProfileChanged(nextDraft: UserProfile) {
    latestDraftRef.current = nextDraft;
    saveVersionRef.current += 1;
    setHasProfileChanges(true);
    return saveVersionRef.current;
  }

  function queueAutoSave(nextDraft: UserProfile, delay = 650) {
    const saveVersion = markProfileChanged(nextDraft);
    setSaveStatus(t('saving'));
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(async () => {
      saveTimeoutRef.current = null;
      const saved = await saveProfile(nextDraft);
      if (saved && saveVersionRef.current === saveVersion) setHasProfileChanges(false);
    }, delay);
  }

  async function saveDraftNow(nextDraft = latestDraftRef.current, saveVersion = saveVersionRef.current) {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    latestDraftRef.current = nextDraft;
    setManualSaving(true);
    setSaveStatus(t('saving'));
    try {
      const saved = await saveProfile(nextDraft, 'savedManually');
      if (saved && saveVersionRef.current === saveVersion) setHasProfileChanges(false);
    } finally {
      setManualSaving(false);
    }
  }

  function flushAutoSave() {
    void saveDraftNow(latestDraftRef.current);
  }

  async function enableNotifications() {
    if (false && typeof Notification === 'undefined') {
      setNotificationStatus('indisponível');
      return;
    }

    const permission = await requestNativeNotifications();
    setNotificationStatus(permission);
    if (permission === 'granted') {
      const nextPreferences = { ...notificationPreferences, enabled: true };
      setNotificationPreferences(nextPreferences);
      saveNotificationPreferencesLocal(profile.uid, nextPreferences);
      await syncNotificationPreferences(profile.uid, nextPreferences);
      await registerDeviceForPush(profile.uid);
      await showAppNotification('Raddo', t('notificationEnabledBody'));
    }
  }

  async function updateNotificationPreferences(patch: Partial<NotificationPreferences>) {
    const nextPreferences = { ...notificationPreferences, ...patch };
    setNotificationPreferences(nextPreferences);
    try {
      await saveNotificationPreferences(profile.uid, nextPreferences);
    } catch (error) {
      setSafetyMessage(error instanceof Error ? error.message : 'Não consegui salvar as notificações.');
    }
  }

  async function handleUnblock(uid: string) {
    try {
      await unblockProfile(profile.uid, uid);
      setSafetyMessage(t('unblocked'));
    } catch (error) {
      setSafetyMessage(error instanceof Error ? error.message : t('unblockError'));
    }
  }

  async function handleUndoInteraction(uid: string) {
    try {
      await undoProfileInteraction(profile.uid, uid);
      setInteractionsMessage('Interação desfeita. Essa pessoa pode aparecer novamente.');
    } catch (error) {
      setInteractionsMessage(error instanceof Error ? error.message : 'Não consegui desfazer essa interação.');
    }
  }

  function unlockInteractionsForFiveMinutes() {
    const unlockUntil = Date.now() + 5 * 60 * 1000;
    setInteractionsUnlockUntil(unlockUntil);
    window.localStorage.setItem(`raddo-interactions-unlock-until:${profile.uid}`, String(unlockUntil));
  }

  async function openInteractionsWithAd() {
    if (interactionsUnlocked) return;

    const shownRealAd = await showRewardedVideoAd();
    if (shownRealAd) {
      unlockInteractionsForFiveMinutes();
      return;
    }

    setInteractionsAdOpen(true);
  }

  function finishInteractionsAd() {
    unlockInteractionsForFiveMinutes();
    setInteractionsAdOpen(false);
  }

  async function handleDeleteAccount() {
    const firstConfirm = window.confirm(t('deleteConfirm1'));
    if (!firstConfirm) return;
    const secondConfirm = window.confirm(t('deleteConfirm2'));
    if (!secondConfirm) return;

    setDeletingAccount(true);
    setSafetyMessage(t('deletingAccount'));

    try {
      await deleteMyAccount();
      setSafetyMessage(t('deleteAccountSuccess'));
    } catch (error) {
      setSafetyMessage(error instanceof Error ? error.message : t('deleteAccountError'));
      setDeletingAccount(false);
    }
  }

  function openAppRating() {
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.raddo.app';
    window.open(playStoreUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleBanAppUser() {
    const targetUid = banUserUid.trim();
    if (!targetUid) {
      setSafetyMessage('Informe o UID do usuário que será banido.');
      return;
    }

    const confirmed = window.confirm(`Banir este usuário do app?\n\n${targetUid}`);
    if (!confirmed) return;

    try {
      await banAppUser({
        bannedByUid: profile.uid,
        bannedUid: targetUid,
        reason: banReason,
      });
      setBanUserUid('');
      setBanReason('');
      setSafetyMessage('Usuário banido do app.');
    } catch (error) {
      setSafetyMessage(error instanceof Error ? error.message : 'Não consegui banir o usuário.');
    }
  }

  async function handleUnbanAppUser(uid: string) {
    const confirmed = window.confirm('Desbanir este usuário do app?');
    if (!confirmed) return;

    try {
      await unbanAppUser(uid);
      setSafetyMessage('Usuário desbanido do app.');
    } catch (error) {
      setSafetyMessage(error instanceof Error ? error.message : 'Não consegui desbanir o usuário.');
    }
  }

  return (
    <section className="mx-auto grid w-full min-w-0 max-w-4xl gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
      {showPublicPreview && (
        <ProfilePreview
          me={draft}
          onClose={() => setShowPublicPreview(false)}
          profile={draft}
          showReport={false}
        />
      )}
      {interactionsAdOpen && (
        <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/75 p-6 backdrop-blur">
          <section className="w-full max-w-sm overflow-hidden rounded-lg border border-white/10 bg-[#07111f] text-white shadow-2xl">
            <div className="grid aspect-video place-items-center bg-[linear-gradient(135deg,#0f172a,#1d4ed8_55%,#ec4899)]">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur">
                <Play className="ml-1 h-8 w-8 fill-white text-white" />
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Anúncio</p>
              <h2 className="mt-1 text-lg font-semibold">Vídeo patrocinado</h2>
              <p className="mt-2 text-sm text-slate-300">Assista ao vídeo para ver suas interações por 5 minutos.</p>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full rounded-full bg-teal-300" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="h-11 rounded-lg border border-white/10 bg-white/8 font-semibold text-slate-100"
                  onClick={() => setInteractionsAdOpen(false)}
                  type="button"
                >
                  Agora não
                </button>
                <button className="h-11 rounded-lg bg-teal-300 font-semibold text-slate-950" onClick={finishInteractionsAd} type="button">
                  Ver interações
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {hasProfileChanges && (
        <button
          aria-label={t('saveSettings')}
          className="fixed inset-x-3 z-[760] mx-auto grid h-14 max-w-xl place-items-center rounded-lg bg-teal-300 px-4 text-sm font-bold text-slate-950 shadow-2xl shadow-black/35 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={manualSaving || uploadingProfilePhoto || uploadingCarouselPhotos}
          onClick={() => void saveDraftNow(draft)}
          style={{
            bottom: 'calc(var(--raddo-bottom-safe) + 92px)',
          }}
          title={t('saveSettings')}
          type="button"
        >
          <span className="truncate">{manualSaving ? t('saving') : 'Salvar'}</span>
        </button>
      )}
      <aside className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white/8">
        <div className="grid place-items-center bg-slate-950/60 p-5">
          {draft.photoURL ? (
            <img alt="" className="aspect-square w-1/2 min-w-24 rounded-full border border-white/10 object-cover" src={draft.photoURL} />
          ) : (
            <div className="grid aspect-square w-1/2 min-w-24 place-items-center rounded-full border border-white/10 bg-slate-950 text-sm text-slate-300">
              Sem foto
            </div>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 p-3">
          {draft.photos.map((photo) => (
            <div className="aspect-square overflow-hidden rounded-lg border border-white/10" key={photo}>
              <img alt="" className="h-full w-full object-cover" src={photo} />
            </div>
          ))}
        </div>
        <div className="p-4">
          <h1 className="truncate text-2xl font-semibold">{draft.displayName}</h1>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">{draft.bio || 'Bio vazia'}</p>
          <button
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 text-sm font-semibold text-slate-100"
            onClick={() => setShowPublicPreview(true)}
            type="button"
          >
            <Eye className="h-4 w-4 text-teal-300" />
            Ver como público
          </button>
          <p className="mt-3 text-xs text-teal-200">{saveStatus}</p>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <nav className="grid min-w-0 grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/8 p-2 sm:grid-cols-3">
          {settingsSections.map((section) => (
            <button
              className={`min-w-0 truncate rounded-lg px-2 text-sm font-semibold ${
                activeSection === section.value ? 'bg-teal-300 text-slate-950' : 'text-slate-200 hover:bg-white/8'
              } h-10`}
              key={section.value}
              onClick={() => setActiveSection(section.value)}
              type="button"
            >
              {t(section.label)}
            </button>
          ))}
        </nav>

        {activeSection === 'profile' && (
          <div className="min-w-0 space-y-4">
            <section className="min-w-0 rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Camera className="h-4 w-4 text-teal-300" />
                Perfil, fotos e bio
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  Nome
                  <input
                    className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none"
                    onChange={(event) => updateDraft('displayName', event.target.value)}
                    value={draft.displayName}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Idade: {draft.age ?? 18}
                  <input
                    max={99}
                    min={18}
                    onChange={(event) => updateDraft('age', Number(event.target.value))}
                    type="range"
                    value={draft.age ?? 18}
                  />
                </label>
                <div className="grid gap-2 text-sm">
                  <span>Foto de perfil</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
                      <Camera className="h-4 w-4 text-teal-300" />
                      {uploadingProfilePhoto ? 'Enviando...' : 'Abrir câmera'}
                      <input accept="image/*" capture="environment" className="hidden" onChange={uploadProfilePhoto} type="file" />
                    </label>
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
                      <Upload className="h-4 w-4 text-teal-300" />
                      {uploadingProfilePhoto ? 'Enviando...' : 'Escolher foto'}
                      <input accept={GALLERY_IMAGE_ACCEPT} className="hidden" onChange={uploadProfilePhoto} type="file" />
                    </label>
                  </div>
                </div>
                {draft.photoURL && (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2">
                    <img alt="" className="h-12 w-12 rounded-lg object-cover" src={draft.photoURL} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Foto principal</p>
                      <p className="text-xs text-slate-300">Essa aparece no card, mapa e lista de conversas.</p>
                    </div>
                  </div>
                )}
                <div className="grid gap-2 text-sm">
                  <span>Fotos do carrossel</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
                      <Camera className="h-4 w-4 text-teal-300" />
                      {uploadingCarouselPhotos ? 'Enviando...' : 'Abrir câmera'}
                      <input accept="image/*" capture="environment" className="hidden" onChange={uploadCarouselPhotos} type="file" />
                    </label>
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
                      <Upload className="h-4 w-4 text-teal-300" />
                      {uploadingCarouselPhotos ? 'Enviando...' : 'Escolher fotos'}
                      <input accept={GALLERY_IMAGE_ACCEPT} className="hidden" multiple onChange={uploadCarouselPhotos} type="file" />
                    </label>
                  </div>
                </div>
                {draft.photos.length > 0 && (
                  <div className="grid gap-2">
                    {draft.photos.map((photo) => (
                      <div className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2" key={photo}>
                        <img alt="" className="h-10 w-10 rounded-lg object-cover" src={photo} />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-300">Foto do carrossel</span>
                        <button
                          className="ml-auto h-9 rounded-lg border border-white/10 px-3 text-xs text-slate-200"
                          onClick={() => removePhoto(photo)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="grid gap-1 text-sm">
                  Bio
                  <textarea
                    className="min-h-24 rounded-lg border border-white/10 bg-slate-950/60 p-3 outline-none"
                    maxLength={BIO_MAX_LENGTH}
                    onChange={(event) => updateDraft('bio', event.target.value.slice(0, BIO_MAX_LENGTH))}
                    value={draft.bio}
                  />
                  <span className="text-right text-xs text-slate-400">
                    {draft.bio.length}/{BIO_MAX_LENGTH}
                  </span>
                </label>
              </div>
            </section>

          </div>
        )}

        {activeSection === 'gender' && (
          <div className="min-w-0 space-y-4">
            <section className="min-w-0 rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 text-teal-300" />
                  Preferências
                </div>
                <div className="grid shrink-0 grid-cols-2 rounded-full border border-white/10 bg-slate-950/40 p-1 text-xs font-semibold">
                  <button
                    className={`rounded-full px-3 py-2 ${preferenceStep === 'find' ? 'bg-teal-300 text-slate-950' : 'text-slate-300'}`}
                    onClick={() => setPreferenceStep('find')}
                    type="button"
                  >
                    Quem encontrar
                  </button>
                  <button
                    className={`rounded-full px-3 py-2 ${preferenceStep === 'identity' ? 'bg-teal-300 text-slate-950' : 'text-slate-300'}`}
                    onClick={() => setPreferenceStep('identity')}
                    type="button"
                  >
                    Eu sou
                  </button>
                </div>
              </div>
              <PreferenceSummary draft={draft} />
              <label className="mb-4 flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 text-sm">
                <Search className="h-4 w-4 text-teal-300" />
                <input
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-500"
                  onChange={(event) => setPreferenceSearch(event.target.value)}
                  placeholder="Pesquisar opções"
                  value={preferenceSearch}
                />
              </label>
              <div className="grid gap-4">
                {preferenceStep === 'find' ? (
                  <>
                    <ModernChipGrid
                      helper="Você verá pessoas que combinam com estes grupos."
                      iconKind="people"
                      query={preferenceSearch}
                      selected={draft.lookingFor}
                      title="Quem você quer encontrar?"
                      values={genderOptions}
                      onChange={(value, checked) => updateDraft('lookingFor', toggleArrayValue(draft.lookingFor, value, checked))}
                    />
                    <ModernChipGrid
                      helper="Escolha entre 3 e 8 para melhorar o matching."
                      iconKind="interest"
                      maxSelected={8}
                      minRecommended={3}
                      query={preferenceSearch}
                      selected={draft.interests}
                      title="Interesses para conversar"
                      values={interestOptions}
                      onChange={(value, checked) => updateDraft('interests', limitedInterests(draft.interests, value, checked))}
                    />
                    <ModernChipGrid
                      helper="Ajuda a encontrar pessoas com a mesma intenção."
                      iconKind="goal"
                      query={preferenceSearch}
                      selected={draft.relationshipGoals}
                      title="Objetivo"
                      values={relationshipGoalOptions}
                      onChange={(value, checked) =>
                        updateDraft('relationshipGoals', toggleArrayValue(draft.relationshipGoals, value, checked))
                      }
                    />
                  </>
                ) : (
                  <>
                    <ModernChipGrid
                      helper="Escolha apenas uma opção ou prefira não informar."
                      iconKind="identity"
                      query={preferenceSearch}
                      selected={draft.genderIdentities.length ? draft.genderIdentities : [draft.gender]}
                      single
                      title="Eu sou"
                      values={genderOptions}
                      onChange={(value) => {
                        const fallback = [value as GenderIdentity];
                        updateDraftPatch({
                          gender: primaryGender(fallback),
                          genderIdentities: fallback,
                        });
                      }}
                    />
                    <ModernChipGrid
                      helper="Escolha apenas uma orientação."
                      iconKind="identity"
                      query={preferenceSearch}
                      selected={draft.sexualities}
                      single
                      title="Orientação"
                      values={sexualityOptions}
                      onChange={(value) => updateDraft('sexualities', [value])}
                    />
                    <ModernChipGrid
                      helper="Refina para quais pessoas você aparece."
                      iconKind="identity"
                      query={preferenceSearch}
                      selected={draft.interestedSexualities}
                      title="Orientações de interesse"
                      values={sexualityOptions}
                      onChange={(value, checked) =>
                        updateDraft('interestedSexualities', toggleArrayValue(draft.interestedSexualities, value, checked))
                      }
                    />
                  </>
                )}
              </div>
            </section>

            {preferenceStep === 'find' && (
              <>
                <section className="min-w-0 rounded-lg border border-white/10 bg-white/8 p-4">
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-teal-300" />
                    {t('reachRadius')}
                  </div>
                  <label className="grid gap-2 text-sm">
                    {t('radius', { radius: formatRadius(draft.visibilityRadius) })}
                    <input
                      max={500}
                      min={0.02}
                      onChange={(event) => updateDraft('visibilityRadius', Number(event.target.value))}
                      onKeyUp={flushAutoSave}
                      onPointerUp={flushAutoSave}
                      onTouchEnd={flushAutoSave}
                      step={0.01}
                      type="range"
                      value={draft.visibilityRadius}
                    />
                  </label>
                </section>

                <section className="min-w-0 rounded-lg border border-white/10 bg-white/8 p-4">
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <SlidersHorizontal className="h-4 w-4 text-teal-300" />
                    {t('agePreference')}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm">
                      {t('minAge')}: {draft.minAgePreference ?? 18}
                      <input
                        max={Math.min(draft.maxAgePreference ?? 60, 99)}
                        min={18}
                        onChange={(event) => updateDraft('minAgePreference', Number(event.target.value))}
                        onKeyUp={flushAutoSave}
                        onPointerUp={flushAutoSave}
                        onTouchEnd={flushAutoSave}
                        type="range"
                        value={draft.minAgePreference ?? 18}
                      />
                    </label>
                    <label className="grid gap-2 text-sm">
                      {t('maxAge')}: {draft.maxAgePreference ?? 60}
                      <input
                        max={99}
                        min={Math.max(draft.minAgePreference ?? 18, 18)}
                        onChange={(event) => updateDraft('maxAgePreference', Number(event.target.value))}
                        onKeyUp={flushAutoSave}
                        onPointerUp={flushAutoSave}
                        onTouchEnd={flushAutoSave}
                        type="range"
                        value={draft.maxAgePreference ?? 60}
                      />
                    </label>
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {activeSection === 'theme' && (
          <div className="grid gap-4">
            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Palette className="h-4 w-4 text-teal-300" />
                {t('appTheme')}
              </div>
              <label className="grid gap-1 text-sm">
                {t('chooseTheme')}
                <select
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none"
                  onChange={(event) => setTheme(event.target.value as AppTheme)}
                  value={currentTheme}
                >
                  {themeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-teal-300" />
                {t('appLanguage')}
              </div>
              <label className="grid gap-1 text-sm">
                {t('chooseLanguage')}
                <select
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none"
                  onChange={(event) => setLanguage(event.target.value as AppLanguage)}
                  value={currentLanguage}
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          </div>
        )}

        {activeSection === 'interactions' && (
          <div className="space-y-4">
            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <RotateCcw className="h-4 w-4 text-teal-300" />
                Interações
              </div>
              <p className="mb-4 text-sm text-slate-300">
                Pessoas que você curtiu ou recusou não aparecem novamente em Pessoas próximas nem no Descobrir. Desfaça para liberar o perfil outra vez.
              </p>
              {!interactionsUnlocked ? (
                <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-300">Usuários grátis podem ver as interações após assistir a um anúncio.</p>
                  <button
                    className="mt-3 h-11 w-full rounded-lg bg-teal-300 text-sm font-semibold text-slate-950"
                    onClick={openInteractionsWithAd}
                    type="button"
                  >
                    Ver anúncio
                  </button>
                </div>
              ) : (
                <>
                  {!profile.isPremium && interactionUnlockMinutes > 0 && (
                    <p className="mb-3 rounded-lg bg-teal-300/10 p-2 text-xs text-teal-100">Interações liberadas por {interactionUnlockMinutes} min.</p>
                  )}
                  {interactions.length === 0 && <p className="rounded-lg bg-slate-950/60 p-3 text-sm text-slate-300">Nenhuma interação registrada ainda.</p>}
                  <div className="grid gap-2">
                    {interactions.map((interaction) => (
                      <article className="flex items-center gap-3 rounded-lg bg-slate-950/60 p-3" key={`${interaction.type}-${interaction.profile.uid}`}>
                        <img alt="" className="h-12 w-12 rounded-lg object-cover" src={interaction.profile.photoURL} />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold">{interaction.profile.displayName}</h3>
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-300">
                            {interaction.type === 'like' ? (
                              <>
                                <Heart className="h-3.5 w-3.5 text-[#ff3f68]" />
                                Curtido
                              </>
                            ) : (
                              <>
                                <X className="h-3.5 w-3.5 text-rose-200" />
                                Recusado
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 text-xs font-semibold text-slate-100"
                          onClick={() => handleUndoInteraction(interaction.profile.uid)}
                          type="button"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Desfazer
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {interactionsMessage && <p className="mt-3 rounded-lg bg-white/8 p-2 text-xs text-slate-100">{interactionsMessage}</p>}
            </section>
          </div>
        )}

        {activeSection === 'premium' && (
          <PremiumScreen
            profile={draft}
            onPremiumActivated={() => {
              setDraft((current) => ({ ...current, isPremium: true }));
              latestDraftRef.current = { ...latestDraftRef.current, isPremium: true };
            }}
          />
        )}

        {activeSection === 'safety' && (
          <div className="space-y-4">
            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Shield className="h-4 w-4 text-teal-300" />
                {t('mapVisibilityTitle')}
              </div>
              <p className="text-sm text-slate-300">{t('mapVisibilityHelp')}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className={`h-11 rounded-lg text-sm font-semibold ${
                    draft.privacyMode === 'exact'
                      ? 'bg-teal-300 text-slate-950'
                      : 'border border-white/10 bg-slate-950/60 text-slate-200'
                  }`}
                  onClick={() => updateDraft('privacyMode', 'exact')}
                  type="button"
                >
                  {t('yes')}
                </button>
                <button
                  className={`h-11 rounded-lg text-sm font-semibold ${
                    draft.privacyMode !== 'exact'
                      ? 'bg-teal-300 text-slate-950'
                      : 'border border-white/10 bg-slate-950/60 text-slate-200'
                  }`}
                  onClick={() => updateDraft('privacyMode', 'nearby')}
                  type="button"
                >
                  {t('no')}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4 text-teal-300" />
                Visibilidade do perfil
              </div>
              <div className="grid gap-2">
                <PrivacyToggle
                  checked={draft.appearInCards}
                  description="Quando desligado, seu perfil não aparece no Descobrir nem em Pessoas próximas."
                  label="Aparecer no Descobrir"
                  onChange={(checked) => updateDraft('appearInCards', checked)}
                />
                <PrivacyToggle
                  checked={draft.showDistance}
                  description="Quando desligado, outras pessoas veem sua bio sem distância aproximada."
                  label="Mostrar distância aproximada"
                  onChange={(checked) => updateDraft('showDistance', checked)}
                />
                <PrivacyToggle
                  checked={draft.showOnlineStatus}
                  description="Controla se outras pessoas podem ver seu status online/ativo."
                  label="Mostrar online agora"
                  onChange={(checked) => updateDraft('showOnlineStatus', checked)}
                />
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Bell className="h-4 w-4 text-teal-300" />
                Notificações
              </div>
              <p className="text-sm text-slate-300">Escolha quais avisos o Raddo pode mostrar no seu aparelho.</p>
              <div className="mt-3 grid gap-2">
                <PrivacyToggle
                  checked={notificationPreferences.enabled}
                  description="Desliga todos os avisos do Raddo sem alterar sua conta."
                  label="Receber notificações"
                  onChange={(checked) => {
                    if (checked && notificationStatus !== 'granted') {
                      void enableNotifications();
                      return;
                    }
                    void updateNotificationPreferences({ enabled: checked });
                  }}
                />
                <PrivacyToggle
                  checked={notificationPreferences.connections}
                  description="Avisos quando você receber uma nova conexão."
                  label="Conexões"
                  onChange={(checked) => void updateNotificationPreferences({ connections: checked })}
                />
                <PrivacyToggle
                  checked={notificationPreferences.connectionMessages}
                  description="Avisos de novas mensagens nas conversas de conexões."
                  label="Conversas em conexões"
                  onChange={(checked) => void updateNotificationPreferences({ connectionMessages: checked })}
                />
                <PrivacyToggle
                  checked={notificationPreferences.mapChats}
                  description="Avisos de mensagens nos chats do mapa em que você entrou."
                  label="Chats do mapa"
                  onChange={(checked) => void updateNotificationPreferences({ mapChats: checked })}
                />
              </div>
              {notificationStatus !== 'granted' && (
                <button
                  className="mt-3 h-11 w-full rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950"
                  onClick={enableNotifications}
                  type="button"
                >
                  Ativar permissão no Android
                </button>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Status do Android: {notificationStatus}. Para bloquear tudo pelo sistema, use as configurações do aparelho.
              </p>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <UserX className="h-4 w-4 text-teal-300" />
                Pessoas bloqueadas
              </div>
              {blockedProfiles.length === 0 && <p className="text-sm text-slate-300">Nenhuma pessoa bloqueada.</p>}
              <div className="grid gap-2">
                {blockedProfiles.map((blockedProfile) => (
                  <article className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2" key={blockedProfile.uid}>
                    <img alt="" className="h-10 w-10 rounded-lg object-cover" src={blockedProfile.photoURL} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{blockedProfile.displayName}</span>
                    <button
                      className="h-9 rounded-lg border border-white/10 px-3 text-xs text-slate-200"
                      onClick={() => handleUnblock(blockedProfile.uid)}
                      type="button"
                    >
                      Desbloquear
                    </button>
                  </article>
                ))}
              </div>
              {safetyMessage && <p className="mt-3 rounded-lg bg-white/8 p-2 text-xs text-slate-100">{safetyMessage}</p>}
            </section>

            {appModeratorRole && (
              <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
                <button
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950"
                  onClick={() => {
                    setModerationTab('reports');
                    setModerationOpen(true);
                  }}
                  type="button"
                >
                  <Shield className="h-4 w-4" />
                  Moderação do app
                </button>
              </section>
            )}

            {appModeratorRole && moderationOpen && (
              <div className="fixed inset-0 z-[1700] grid place-items-center bg-black/70 p-3 backdrop-blur-sm">
              <section className="max-h-[92dvh] w-full max-w-3xl overflow-auto rounded-lg border border-amber-300/30 bg-[#0b1724] p-4 text-white shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                    <Shield className="h-4 w-4" />
                    Moderação do app
                  </div>
                  <button
                    aria-label="Fechar moderação"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/8 text-slate-100"
                    onClick={() => setModerationOpen(false)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-3 text-sm text-amber-50/80">
                  Você está como {appModeratorRole === 'admin' ? 'administrador' : 'moderador'}. Use banimento apenas para contas com violação clara das regras.
                </p>
                {safetyMessage && <p className="mb-3 rounded-lg bg-white/8 p-3 text-sm text-slate-100">{safetyMessage}</p>}
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-950/50 p-1 text-xs">
                  <button
                    className={`h-10 rounded-md font-semibold ${moderationTab === 'reports' ? 'bg-[#ff3f68] text-white' : 'text-slate-200'}`}
                    onClick={() => setModerationTab('reports')}
                    type="button"
                  >
                    Denúncias
                  </button>
                  <button
                    className={`h-10 rounded-md font-semibold ${moderationTab === 'bans' ? 'bg-[#ff3f68] text-white' : 'text-slate-200'}`}
                    onClick={() => setModerationTab('bans')}
                    type="button"
                  >
                    Banidos
                  </button>
                </div>
                {moderationTab === 'reports' && (
                <>
                <div className="mb-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  {[
                    { label: 'Denúncias 24h', value: moderationDashboard.loading ? '...' : moderationDashboard.dashboard.reports24h },
                    { label: 'Spam bloqueado', value: moderationDashboard.loading ? '...' : moderationDashboard.dashboard.spamEvents24h },
                    { label: 'Banidos', value: moderationDashboard.loading ? '...' : moderationDashboard.dashboard.activeBans },
                    { label: 'Push com falha', value: moderationDashboard.loading ? '...' : moderationDashboard.dashboard.pushFailures24h },
                  ].map((item) => (
                    <article className="rounded-lg border border-white/10 bg-[#07111f] p-3" key={item.label}>
                      <p className="text-slate-400">{item.label}</p>
                      <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                    </article>
                  ))}
                </div>
                {moderationDashboard.dashboard.repeatedReportedUsers.length > 0 && (
                  <div className="mb-4 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3">
                    <p className="mb-2 text-xs font-semibold text-rose-100">Usuários reincidentes em denúncias nas últimas 24h</p>
                    <div className="grid gap-1">
                      {moderationDashboard.dashboard.repeatedReportedUsers.map((item) => (
                        <button
                          className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2 text-left text-xs text-slate-100"
                          key={item.uid}
                          onClick={() => setBanUserUid(item.uid)}
                          type="button"
                        >
                          <span className="truncate font-mono">{item.uid}</span>
                          <span className="rounded-full bg-rose-400 px-2 py-1 text-white">{item.count} denúncias</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mb-4 overflow-hidden rounded-xl border border-white/10 bg-[#07111f]">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                      <MessageSquareWarning className="h-4 w-4 text-amber-200" />
                      Denúncias recentes
                    </div>
                    <span className="rounded-full bg-white/8 px-2 py-1 text-xs text-slate-300">
                      {moderationCases.loading ? 'Carregando' : `${moderationCases.cases.length} casos`}
                    </span>
                  </div>
                  <div className="grid max-h-72 overflow-auto">
                    {!moderationCases.loading && moderationCases.cases.length === 0 && (
                      <p className="p-3 text-sm text-slate-300">Nenhuma denúncia com mensagens recentes.</p>
                    )}
                    {moderationCases.cases.map((item) => (
                      <button
                        className={`flex items-center gap-3 border-b border-white/5 p-3 text-left transition hover:bg-white/8 ${
                          selectedModerationCase?.id === item.id ? 'bg-white/10' : ''
                        }`}
                        key={item.id}
                        onClick={() => {
                          setSelectedModerationCase(item);
                          setBanUserUid(item.reportedUid);
                        }}
                        type="button"
                      >
                        {item.userPhotoURL ? (
                          <img alt="" className="h-11 w-11 rounded-full object-cover" src={item.userPhotoURL} />
                        ) : (
                          <div className="grid h-11 w-11 place-items-center rounded-full bg-amber-300 text-sm font-bold text-slate-950">
                            {item.userDisplayName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-white">{item.userDisplayName}</span>
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {new Date(item.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            </span>
                          </div>
                          <p className="truncate text-xs text-slate-300">
                            {item.source === 'image'
                              ? 'Imagem em moderação'
                              : item.contextType === 'map_chat'
                                ? 'Chat denunciado'
                                : 'Perfil denunciado'} · {item.reason}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedModerationCase && (
                  <div className="mb-4 rounded-xl border border-white/10 bg-[#07111f]">
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{selectedModerationCase.userDisplayName}</p>
                        {selectedModerationCase.contextType === 'map_chat' && (
                          <p className="text-xs text-amber-100">Chat denunciado · {selectedModerationCase.recentMessages.length} mensagens salvas</p>
                        )}
                        <p className="text-xs text-slate-300">
                          UID: <span className="font-mono">{selectedModerationCase.reportedUid}</span>
                        </p>
                        <p className="text-xs text-amber-100">{selectedModerationCase.reason}</p>
                      </div>
                      <button
                        aria-label="Fechar caso"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/8 text-slate-100"
                        onClick={() => setSelectedModerationCase(null)}
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {selectedModerationCase.imageUrl && (
                      <div className="border-b border-white/10 p-3">
                        <img alt="" className="max-h-56 w-full rounded-lg object-cover" src={selectedModerationCase.imageUrl} />
                      </div>
                    )}
                    <div className="grid max-h-80 gap-2 overflow-auto p-3">
                      {selectedModerationCase.recentMessages.length === 0 && (
                        <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">Nenhuma mensagem recente salva neste caso.</p>
                      )}
                      {selectedModerationCase.recentMessages.map((message, index) => (
                        <article className="max-w-[86%] rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100" key={message.id || index}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-slate-400">
                            <span>{message.senderName || selectedModerationCase.userDisplayName}</span>
                            {message.createdAt && (
                              <span>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>
                          {message.imageUrl ? (
                            <img alt="" className="max-h-48 rounded-lg object-cover" src={message.imageUrl} />
                          ) : (
                            <p>{message.text || 'Mensagem sem texto'}</p>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm text-amber-50">
                    UID do usuário
                    <input
                      className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-white outline-none"
                      onChange={(event) => setBanUserUid(event.target.value)}
                      placeholder="Cole o UID do usuário"
                      value={banUserUid}
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-amber-50">
                    Motivo
                    <textarea
                      className="min-h-20 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-white outline-none"
                      onChange={(event) => setBanReason(event.target.value)}
                      placeholder="Ex: conteúdo proibido, assédio, spam..."
                      value={banReason}
                    />
                  </label>
                  <button
                    className="h-11 rounded-lg bg-rose-400 px-4 text-sm font-semibold text-white"
                    onClick={handleBanAppUser}
                    type="button"
                  >
                    Banir usuário do app
                  </button>
                </div>
                </>
                )}
                {moderationTab === 'bans' && (
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#07111f] p-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Usuários banidos</p>
                        <p className="text-xs text-slate-400">Veja contas removidas do app e libere quando necessário.</p>
                      </div>
                      <span className="rounded-full bg-white/8 px-2 py-1 text-xs text-slate-300">
                        {appBannedUsers.loading ? 'Carregando' : `${appBannedUsers.bannedUsers.length} banidos`}
                      </span>
                    </div>
                    {!appBannedUsers.loading && appBannedUsers.bannedUsers.length === 0 && (
                      <p className="rounded-lg bg-white/8 p-3 text-sm text-slate-300">Nenhum usuário banido no app.</p>
                    )}
                    {appBannedUsers.bannedUsers.map((bannedUser) => (
                      <article className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#07111f] p-3" key={bannedUser.uid}>
                        {bannedUser.photoURL ? (
                          <img alt="" className="h-11 w-11 rounded-full object-cover" src={bannedUser.photoURL} />
                        ) : (
                          <div className="grid h-11 w-11 place-items-center rounded-full bg-rose-300 text-sm font-bold text-slate-950">
                            {bannedUser.displayName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{bannedUser.displayName}</p>
                          <p className="truncate text-xs text-slate-400">
                            UID: <span className="font-mono">{bannedUser.uid}</span>
                          </p>
                          <p className="truncate text-xs text-rose-100">{bannedUser.reason}</p>
                        </div>
                        <button
                          className="h-10 shrink-0 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-100"
                          onClick={() => handleUnbanAppUser(bannedUser.uid)}
                          type="button"
                        >
                          Desbanir
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              </div>
            )}

            <section className="rounded-lg border border-rose-300/30 bg-rose-300/10 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-100">
                <UserX className="h-4 w-4" />
                {t('deleteAccount')}
              </div>
              <div className="grid gap-2 text-sm text-rose-50/90">
                <p>{t('deleteAccountText')}</p>
                <p className="font-semibold">{t('deleteAccountWarning')}</p>
              </div>
              <button
                className="mt-4 h-11 w-full rounded-lg bg-rose-400 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deletingAccount}
                onClick={handleDeleteAccount}
                type="button"
              >
                {deletingAccount ? t('deletingAccount') : t('deleteAccountButton')}
              </button>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-teal-300" />
                  Termos e privacidade
                </div>
                <button
                  className="h-9 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs font-semibold text-slate-100"
                  onClick={() => setTermsOpen((current) => !current)}
                  type="button"
                >
                  {termsOpen ? 'Ocultar' : 'Ler termos'}
                </button>
              </div>
              {!termsOpen && (
                <p className="mt-3 text-sm text-slate-300">
                  Leia os termos de uso, privacidade, segurança, denúncias, moderação e exclusão de dados do Raddo.
                </p>
              )}
              {termsOpen && <TermsAndPrivacyContent />}
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Star className="h-4 w-4 text-teal-300" />
                {t('rateAppTitle')}
              </div>
              <p className="mb-4 text-sm text-slate-300">{t('rateAppHelp')}</p>
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950"
                onClick={openAppRating}
                type="button"
              >
                <Star className="h-4 w-4" />
                {t('rateAppButton')}
              </button>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

type OptionGridProps<T extends string> = {
  title: string;
  values: Array<{ value: T; label: string }>;
  selected: T[];
  onChange: (value: T, checked: boolean) => void;
  onClear: () => void;
  onSelectAll: () => void;
};

function PreferenceSummary({ draft }: { draft: UserProfile }) {
  const { t } = useI18n();
  const visibleTo = draft.lookingFor.length > 0 ? draft.lookingFor.map((item) => t(item)).join(', ') : 'ninguém';
  const identities = (draft.genderIdentities.length ? draft.genderIdentities : [draft.gender]).map((item) => t(item)).join(', ');
  const interestSummary =
    draft.interests.length > 0 ? draft.interests.map((item) => formatInterest(item)).join(', ') : 'adicione interesses';
  const goalSummary =
    draft.relationshipGoals.length > 0
      ? draft.relationshipGoals.map((item) => formatRelationshipGoal(item)).join(', ')
      : 'sem objetivo definido';

  return (
    <div className="mb-4 grid min-w-0 gap-2 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm">
      <div className="flex min-w-0 flex-wrap gap-2">
        <SummaryPill label="Eu sou" value={identities || formatGender(draft.gender)} />
        <SummaryPill label="Quero ver" value={visibleTo} />
        <SummaryPill label="Interesses" value={interestSummary} />
        <SummaryPill label="Objetivo" value={goalSummary} />
      </div>
      <p className="text-xs leading-relaxed text-slate-300">
        Você aparecerá para pessoas interessadas em {identities || 'seu perfil'}.
      </p>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs">
      <span className="text-slate-400">{label}:</span>
      <span className="truncate font-semibold text-slate-100">{value}</span>
    </span>
  );
}

function PrivacyToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-left"
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-400">{description}</span>
      </span>
      <span className={`grid h-7 w-12 shrink-0 rounded-full p-1 transition ${checked ? 'bg-teal-300' : 'bg-slate-700'}`}>
        <span className={`h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

function TermsAndPrivacyContent() {
  const sections = [
    {
      title: '1. Uso do Raddo',
      text:
        'O Raddo é um app social para conhecer pessoas próximas, conversar em matches e participar de chats locais no mapa. Ao usar o app, você concorda em respeitar outros usuários, não publicar conteúdo ilegal, ofensivo, sexual envolvendo menores, violento, fraudulento, discriminatório ou que viole direitos de terceiros.',
    },
    {
      title: '2. Idade mínima',
      text:
        'O Raddo é destinado apenas a pessoas com 18 anos ou mais. Contas suspeitas de pertencer a menores de idade podem ser removidas ou banidas sem aviso prévio.',
    },
    {
      title: '3. Localização',
      text:
        'O app usa sua localização para calcular distâncias, mostrar chats próximos e melhorar a descoberta de pessoas no seu alcance. Sua foto só aparece no mapa quando você ativa a opção de aparecer no mapa. Você pode desativar essa visibilidade nas configurações de segurança.',
    },
    {
      title: '4. Perfil, fotos e mensagens',
      text:
        'Você é responsável pelas informações, fotos, mensagens e chats que publica. Fotos de perfil, capas de chats e imagens enviadas podem passar por verificação automática e revisão humana quando necessário para proteger a comunidade.',
    },
    {
      title: '5. Conteúdo proibido',
      text:
        'É proibido publicar nudez explícita, exploração sexual, conteúdo envolvendo menores, assédio, ameaças, discurso de ódio, golpes, spam, divulgação indevida de dados pessoais, conteúdo violento extremo ou qualquer material ilegal.',
    },
    {
      title: '6. Denúncias, bloqueios e moderação',
      text:
        'Usuários podem denunciar perfis, chats e conteúdos inadequados. O Raddo pode analisar denúncias, remover conteúdo, limitar recursos, bloquear acesso a chats ou banir contas que violem as regras. Donos e moderadores de chats locais também podem remover mensagens e banir pessoas daquele chat.',
    },
    {
      title: '7. Privacidade e dados',
      text:
        'Coletamos dados necessários para funcionamento do app, como perfil, fotos, preferências, localização aproximada ou exata quando ativada, curtidas, matches, mensagens, denúncias, bloqueios, tokens de notificação e registros técnicos. Esses dados são usados para autenticação, descoberta, chat, segurança, moderação e prevenção de abuso.',
    },
    {
      title: '8. Compartilhamento de dados',
      text:
        'Não vendemos seus dados pessoais. Podemos usar serviços de infraestrutura, autenticação, banco de dados, armazenamento, notificações, anúncios, pagamentos e moderação para operar o app. Também podemos compartilhar informações quando exigido por lei ou para proteger usuários e a plataforma.',
    },
    {
      title: '9. Premium e anúncios',
      text:
        'Alguns recursos podem depender de anúncios ou assinatura Premium. O preço informado no app pode ser exibido como R$4,99 mensais. Assinaturas, cobranças, cancelamentos e reembolsos seguem as regras da loja ou meio de pagamento utilizado.',
    },
    {
      title: '10. Exclusão de conta',
      text:
        'Você pode solicitar ou executar a exclusão da conta na área de segurança. A exclusão remove perfil, fotos, localização, curtidas, matches, mensagens e chats criados quando tecnicamente possível. Alguns registros mínimos podem ser mantidos temporariamente por obrigação legal, segurança ou prevenção de abuso.',
    },
    {
      title: '11. Segurança infantil',
      text:
        'O Raddo não permite menores de 18 anos. Conteúdo de exploração, abuso ou sexualização de menores é proibido e pode ser denunciado às autoridades competentes quando aplicável.',
    },
    {
      title: '12. Alterações',
      text:
        'Estes termos podem ser atualizados para refletir mudanças no app, exigências legais ou melhorias de segurança. O uso contínuo do Raddo após alterações indica concordância com a versão atualizada.',
    },
    {
      title: '13. Contato',
      text:
        'Para dúvidas, denúncias, privacidade ou exclusão de dados, entre em contato pelo canal de suporte informado na página do app ou nos materiais oficiais do Raddo.',
    },
  ];

  return (
    <div className="mt-4 max-h-96 space-y-4 overflow-auto rounded-lg border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
      {sections.map((section) => (
        <section className="space-y-1" key={section.title}>
          <h3 className="font-semibold text-slate-100">{section.title}</h3>
          <p className="leading-relaxed">{section.text}</p>
        </section>
      ))}
    </div>
  );
}

type ModernChipGridProps<T extends string> = {
  title: string;
  helper: string;
  values: Array<{ value: T; label: string }>;
  selected: T[];
  query: string;
  iconKind: 'people' | 'identity' | 'interest' | 'goal';
  minRecommended?: number;
  maxSelected?: number;
  single?: boolean;
  onChange: (value: T, checked: boolean) => void;
};

function ModernChipGrid<T extends string>({
  title,
  helper,
  values,
  selected,
  query,
  iconKind,
  minRecommended,
  maxSelected,
  single = false,
  onChange,
}: ModernChipGridProps<T>) {
  const { t } = useI18n();
  const cleanQuery = query.trim().toLowerCase();
  const filteredValues = cleanQuery
    ? values.filter((option) => `${option.label} ${t(option.value)}`.toLowerCase().includes(cleanQuery))
    : values;
  const reachedLimit = typeof maxSelected === 'number' && selected.length >= maxSelected;

  return (
    <div className="grid min-w-0 gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-3 text-sm">
      <div className="min-w-0">
        <h3 className="font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{helper}</p>
        {minRecommended && (
          <p className={`mt-1 text-xs ${selected.length >= minRecommended ? 'text-teal-300' : 'text-amber-200'}`}>
            {selected.length}/{maxSelected ?? values.length} selecionados
          </p>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
        {filteredValues.map((option) => {
          const active = selected.includes(option.value);
          const disabled = !active && reachedLimit;
          const Icon = chipIcon(option.value, iconKind);
          return (
            <button
              className={`group min-h-14 min-w-0 rounded-xl border px-3 py-2 text-left transition ${
                active
                  ? 'border-teal-300/70 bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/20'
                  : 'border-white/10 bg-slate-950/60 text-slate-100'
              } ${disabled ? 'opacity-45' : 'active:scale-[0.98]'}`}
              disabled={disabled}
              key={option.value}
              onClick={() => onChange(option.value, single ? true : !active)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-slate-950' : 'text-teal-300'}`} />
                <span className="min-w-0 truncate font-semibold">{t(option.value) || option.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function chipIcon(value: string, kind: ModernChipGridProps<string>['iconKind']) {
  if (kind === 'interest') {
    const interestIcons: Partial<Record<ProfileInterest, typeof Sparkles>> = {
      games: Gamepad2,
      gym: Dumbbell,
      anime: Sparkles,
      technology: MessageCircle,
      music: Music,
      travel: Plane,
      cars: Car,
      pets: PawPrint,
    };
    return interestIcons[value as ProfileInterest] ?? Sparkles;
  }


  if (kind === 'goal') {
    const goalIcons: Partial<Record<RelationshipGoal, typeof Sparkles>> = {
      dating: Heart,
      friendship: UserRound,
      chat: MessageCircle,
      casual: Sparkles,
    };
    return goalIcons[value as RelationshipGoal] ?? Sparkles;
  }

  return kind === 'people' ? UserRound : Sparkles;
}

type SingleChoiceChipsProps<T extends string> = {
  title: string;
  values: Array<{ value: T; label: string }>;
  selected: T;
  onChange: (value: T) => void;
};

function SingleChoiceChips<T extends string>({ title, values, selected, onChange }: SingleChoiceChipsProps<T>) {
  const { t } = useI18n();

  return (
    <div className="grid gap-2 text-sm">
      <span className="font-semibold text-slate-100">{title}</span>
      <div className="flex flex-wrap gap-2">
        {values.map((option) => {
          const active = selected === option.value;
          return (
            <button
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                active
                  ? 'bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/30'
                  : 'border border-white/10 bg-slate-950/60 text-slate-200'
              }`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {t(option.value) || option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OptionGrid<T extends string>({ title, values, selected, onChange, onClear, onSelectAll }: OptionGridProps<T>) {
  const { t } = useI18n();
  const selectedCount = selected.length;

  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-slate-950/35 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-slate-100">{title}</span>
          <p className="mt-0.5 text-xs text-slate-400">
            {selectedCount === 0 ? 'Nenhuma opção selecionada' : `${selectedCount} selecionada${selectedCount > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className="h-8 rounded-full border border-white/10 bg-white/8 px-3 text-xs font-semibold text-slate-100"
            onClick={onSelectAll}
            type="button"
          >
            Todos
          </button>
          <button
            className="h-8 rounded-full border border-white/10 bg-white/8 px-3 text-xs font-semibold text-slate-100"
            onClick={onClear}
            type="button"
          >
            Limpar
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                active
                  ? 'bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/30'
                  : 'border border-white/10 bg-slate-950/60 text-slate-200'
              }`}
              key={option.value}
              onClick={() => onChange(option.value, !active)}
              type="button"
            >
              {t(option.value) || formatSexuality(option.value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}


