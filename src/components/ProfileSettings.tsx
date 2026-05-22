import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Bell, Camera, Eye, FileText, Heart, MapPin, Palette, RotateCcw, Shield, SlidersHorizontal, Upload, UserX, X } from 'lucide-react';
import { genderOptions, sexualityOptions, formatRadius } from '../profileOptions';
import { isDemoMode } from '../demoData';
import { deleteMyAccount } from '../accountDeletion';
import { languageOptions, useI18n } from '../i18n';
import { supabase } from '../supabase';
import type { AppLanguage, AppTheme, GenderIdentity, Sexuality, UserProfile } from '../types';
import { unblockProfile, undoProfileInteraction, useBlockedProfiles, useProfileInteractions } from '../hooks/useMatches';
import PremiumScreen from './PremiumScreen';
import ProfilePreview from './ProfilePreview';
import { getNotificationPermission, requestNativeNotifications, showAppNotification } from '../nativeNotifications';
import { registerDeviceForPush } from '../pushNotifications';

type Props = {
  profile: UserProfile;
  currentTheme: AppTheme;
  currentLanguage: AppLanguage;
  setTheme: (theme: AppTheme) => void;
  setLanguage: (language: AppLanguage) => void;
};

const themeOptions: Array<{ value: AppTheme; label: string }> = [
  { value: 'dark', label: 'darkTheme' },
  { value: 'light', label: 'lightTheme' },
  { value: 'pride', label: 'colorfulTheme' },
];

type SettingsSection = 'profile' | 'gender' | 'interactions' | 'theme' | 'premium' | 'safety';

const settingsSections: Array<{ value: SettingsSection; label: string }> = [
  { value: 'profile', label: 'profileTab' },
  { value: 'gender', label: 'preferencesTab' },
  { value: 'interactions', label: 'Interações' },
  { value: 'theme', label: 'themeTab' },
  { value: 'premium', label: 'premiumTab' },
  { value: 'safety', label: 'safetyTab' },
];

export default function ProfileSettings({ currentLanguage, currentTheme, profile, setLanguage, setTheme }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(profile);
  const [saveStatus, setSaveStatus] = useState(t('savedAutomatically'));
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [uploadingCarouselPhotos, setUploadingCarouselPhotos] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [showPublicPreview, setShowPublicPreview] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState(
    typeof Notification === 'undefined' ? 'indisponível' : Notification.permission,
  );
  const [safetyMessage, setSafetyMessage] = useState('');
  const [interactionsMessage, setInteractionsMessage] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const firstDraftRender = useRef(true);
  const blockedProfiles = useBlockedProfiles(profile.uid);
  const interactions = useProfileInteractions(profile.uid);

  useEffect(() => {
    getNotificationPermission().then(setNotificationStatus);
  }, []);

  function updateDraft<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleArrayValue<T extends string>(values: T[], value: T, checked: boolean) {
    return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
  }

  async function uploadFile(file: File) {
    if (isDemoMode) return URL.createObjectURL(file);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${profile.uid}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) return '';

    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingProfilePhoto(true);
    const uploadedUrl = await uploadFile(file);
    if (uploadedUrl) updateDraft('photoURL', uploadedUrl);
    setUploadingProfilePhoto(false);
    event.target.value = '';
  }

  async function uploadCarouselPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setUploadingCarouselPhotos(true);
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const uploadedUrl = await uploadFile(file);
      if (uploadedUrl) uploadedUrls.push(uploadedUrl);
    }

    if (uploadedUrls.length > 0) {
      const nextPhotos = [...draft.photos, ...uploadedUrls].slice(0, 9);
      updateDraft('photos', nextPhotos);
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

  async function saveProfile(nextDraft: UserProfile) {
    if (isDemoMode) {
      setSaveStatus(t('savedAutomatically'));
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: nextDraft.displayName,
        photo_url: nextDraft.photoURL || '',
        photos: nextDraft.photos,
        privacy_mode: nextDraft.privacyMode,
        visibility_radius: nextDraft.visibilityRadius,
        age: nextDraft.age ?? 18,
        gender: nextDraft.gender,
        sexualities: nextDraft.sexualities,
        looking_for: nextDraft.lookingFor,
        interested_sexualities: nextDraft.interestedSexualities,
        min_age_preference: nextDraft.minAgePreference ?? 18,
        max_age_preference: nextDraft.maxAgePreference ?? 60,
        bio: nextDraft.bio,
        is_premium: nextDraft.isPremium,
        last_seen: new Date().toISOString(),
      })
      .eq('id', profile.uid);

    setSaveStatus(error ? t('savedError', { message: error.message }) : t('savedAutomatically'));
  }

  useEffect(() => {
    if (firstDraftRender.current) {
      firstDraftRender.current = false;
      return undefined;
    }

    setSaveStatus(t('saving'));
    const timeoutId = window.setTimeout(() => {
      void saveProfile(draft);
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [draft]);

  async function enableNotifications() {
    if (false && typeof Notification === 'undefined') {
      setNotificationStatus('indisponível');
      return;
    }

    const permission = await requestNativeNotifications();
    setNotificationStatus(permission);
    if (permission === 'granted') {
      await registerDeviceForPush(profile.uid);
      await showAppNotification('Raddo', t('notificationEnabledBody'));
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

  return (
    <section className="mx-auto grid max-w-4xl gap-4 md:grid-cols-[280px_1fr]">
      {showPublicPreview && (
        <ProfilePreview
          me={draft}
          onClose={() => setShowPublicPreview(false)}
          profile={draft}
          showReport={false}
        />
      )}
      <aside className="overflow-hidden rounded-lg border border-white/10 bg-white/8">
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
          <p className="mt-1 text-sm text-slate-300">{draft.bio || 'Bio vazia'}</p>
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

      <div className="space-y-4">
        <nav className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/8 p-2 sm:grid-cols-3">
          {settingsSections.map((section) => (
            <button
              className={`h-10 rounded-lg text-sm font-semibold ${
                activeSection === section.value ? 'bg-teal-300 text-slate-950' : 'text-slate-200 hover:bg-white/8'
              }`}
              key={section.value}
              onClick={() => setActiveSection(section.value)}
              type="button"
            >
              {t(section.label)}
            </button>
          ))}
        </nav>

        {activeSection === 'profile' && (
          <div className="space-y-4">
            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
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
                <label className="grid gap-2 text-sm">
                  Foto de perfil
                  <span className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
                    <Upload className="h-4 w-4 text-teal-300" />
                    {uploadingProfilePhoto ? 'Enviando...' : 'Trocar foto de perfil'}
                    <input accept="image/*" className="hidden" onChange={uploadProfilePhoto} type="file" />
                  </span>
                </label>
                {draft.photoURL && (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2">
                    <img alt="" className="h-12 w-12 rounded-lg object-cover" src={draft.photoURL} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Foto principal</p>
                      <p className="text-xs text-slate-300">Essa aparece no card, mapa e lista de conversas.</p>
                    </div>
                  </div>
                )}
                <label className="grid gap-2 text-sm">
                  Fotos do carrossel
                  <span className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
                    <Upload className="h-4 w-4 text-teal-300" />
                    {uploadingCarouselPhotos ? 'Enviando...' : 'Enviar fotos para carrossel'}
                    <input accept="image/*" className="hidden" multiple onChange={uploadCarouselPhotos} type="file" />
                  </span>
                </label>
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
                    onChange={(event) => updateDraft('bio', event.target.value)}
                    value={draft.bio}
                  />
                </label>
              </div>
            </section>

          </div>
        )}

        {activeSection === 'gender' && (
          <div className="space-y-4">
            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-teal-300" />
                {t('genderInterests')}
              </div>
              <div className="grid gap-4">
              <label className="grid gap-1 text-sm">
                {t('iAm')}
                <select
                  className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none"
                  onChange={(event) => updateDraft('gender', event.target.value as GenderIdentity)}
                  value={draft.gender}
                >
                  {genderOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.value)}
                    </option>
                  ))}
                </select>
              </label>
              <OptionGrid
                selected={draft.sexualities}
                title={t('mySexuality')}
                values={sexualityOptions}
                onChange={(value, checked) =>
                  updateDraft('sexualities', toggleArrayValue(draft.sexualities, value, checked))
                }
              />
              <OptionGrid
                selected={draft.lookingFor}
                title={t('interestedIn')}
                values={genderOptions}
                onChange={(value, checked) => updateDraft('lookingFor', toggleArrayValue(draft.lookingFor, value, checked))}
              />
              <OptionGrid
                selected={draft.interestedSexualities}
                title={t('interestedSexualities')}
                values={sexualityOptions}
                onChange={(value, checked) =>
                  updateDraft('interestedSexualities', toggleArrayValue(draft.interestedSexualities, value, checked))
                }
              />
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
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
                  step={0.01}
                  type="range"
                  value={draft.visibilityRadius}
                />
              </label>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/8 p-4">
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
                    type="range"
                  value={draft.maxAgePreference ?? 60}
                  />
                </label>
              </div>
            </section>
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
                Pessoas que você curtiu ou recusou não aparecem novamente em Pessoas próximas nem nos Cards. Desfaça para liberar o perfil outra vez.
              </p>
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
              {interactionsMessage && <p className="mt-3 rounded-lg bg-white/8 p-2 text-xs text-slate-100">{interactionsMessage}</p>}
            </section>
          </div>
        )}

        {activeSection === 'premium' && <PremiumScreen profile={draft} />}

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
                <Bell className="h-4 w-4 text-teal-300" />
                Notificações
              </div>
              <p className="text-sm text-slate-300">
                Ative para receber avisos de novos matches, mensagens e atividade em chats do mapa.
              </p>
              <button
                className="mt-3 h-11 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950"
                onClick={enableNotifications}
                type="button"
              >
                {notificationStatus === 'granted' ? 'Notificações ativadas' : 'Ativar notificações'}
              </button>
              <p className="mt-2 text-xs text-slate-400">Status: {notificationStatus}</p>
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
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-teal-300" />
                Termos e privacidade
              </div>
              <div className="grid gap-3 text-sm text-slate-300">
                <p>
                  O Raddo usa sua localização para calcular distâncias e chats próximos. Sua foto só aparece no
                  mapa se você ativar a opção "Me mostrar no mapa".
                </p>
                <p>
                  Denúncias e bloqueios devem ser usados contra assédio, perfis falsos, spam ou conteúdo inadequado.
                </p>
                <p>
                  Antes de publicar na loja, substitua este resumo por termos de uso e política de privacidade completos.
                </p>
              </div>
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
};

function OptionGrid<T extends string>({ title, values, selected, onChange }: OptionGridProps<T>) {
  const { t } = useI18n();

  return (
    <div className="grid gap-2 text-sm">
      <span>{title}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {values.map((option) => (
          <label
            className="flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3"
            key={option.value}
          >
            <input
              checked={selected.includes(option.value)}
              onChange={(event) => onChange(option.value, event.target.checked)}
              type="checkbox"
            />
            {t(option.value)}
          </label>
        ))}
      </div>
    </div>
  );
}
