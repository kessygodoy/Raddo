import { ChangeEvent, useState } from 'react';
import { Camera, MapPin, Sparkles, Upload } from 'lucide-react';
import { genderOptions, sexualityOptions } from '../profileOptions';
import { isDemoMode } from '../demoData';
import { useI18n } from '../i18n';
import { supabase } from '../supabase';
import type { GenderIdentity, Sexuality, UserProfile } from '../types';
import { moderateUploadedImage } from '../imageModeration';

type Props = {
  profile: UserProfile;
  onDone: () => void;
};

export default function Onboarding({ profile, onDone }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<'profile' | 'preferences'>('profile');
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [photoURL, setPhotoURL] = useState(profile.photoURL);
  const [age, setAge] = useState(profile.age ?? 18);
  const [bio, setBio] = useState(profile.bio);
  const [gender, setGender] = useState<GenderIdentity>(profile.gender);
  const [sexualities, setSexualities] = useState<Sexuality[]>(profile.sexualities);
  const [lookingFor, setLookingFor] = useState<GenderIdentity[]>(profile.lookingFor.length ? profile.lookingFor : ['woman']);
  const [visibilityRadius] = useState(profile.visibilityRadius || 30);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');

  function toggleValue<T extends string>(values: T[], value: T) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  async function uploadProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setError('');

    try {
      if (isDemoMode) {
        setPhotoURL(URL.createObjectURL(file));
        return;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `${profile.uid}/profile/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('profile-photos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message || 'Não consegui enviar a foto.');

      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
      await moderateUploadedImage({ context: 'profile-photo', path, publicUrl: data.publicUrl });
      setPhotoURL(data.publicUrl);
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'Não consegui enviar a foto.');
    } finally {
      setUploadingPhoto(false);
      event.target.value = '';
    }
  }

  function goToPreferences() {
    setError('');
    if (!displayName.trim()) {
      setError(t('chooseProfileName'));
      return;
    }
    setStep('preferences');
  }

  async function finish() {
    setSaving(true);
    setError('');

    if (!displayName.trim()) {
      setError(t('chooseProfileName'));
      setSaving(false);
      return;
    }

    if (lookingFor.length === 0) {
      setError(t('chooseInterest'));
      setSaving(false);
      return;
    }

    if (!isDemoMode) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          photo_url: photoURL || '',
          photos: photoURL ? [photoURL] : [],
          age,
          bio: bio.trim(),
          gender,
          sexualities,
          looking_for: lookingFor,
          privacy_mode: 'nearby',
          visibility_radius: visibilityRadius,
          last_seen: new Date().toISOString(),
        })
        .eq('id', profile.uid);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    }

    window.localStorage.setItem(`raddo-onboarding:${profile.uid}`, 'done');
    setSaving(false);
    onDone();
  }

  return (
    <main className="app-shell theme-dark min-h-dvh overflow-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+20px)] text-white">
      <section className="mx-auto grid min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-40px)] max-w-2xl content-center gap-4">
        <div className="rounded-lg border border-white/10 bg-white/8 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-teal-300 text-slate-950">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{t('onboardingTitle')}</h1>
              <p className="text-sm text-slate-300">{t('onboardingSubtitle')}</p>
            </div>
          </div>
        </div>

        {step === 'profile' && (
          <section className="grid gap-3 rounded-lg border border-white/10 bg-white/8 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Camera className="h-4 w-4 text-teal-300" />
              {t('profileTab')}
            </div>
            <input
              className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t('name')}
              value={displayName}
            />
            <div className="grid gap-2">
              <span className="text-sm text-slate-300">Foto de perfil</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm">
                  <Camera className="h-4 w-4 text-teal-300" />
                  {uploadingPhoto ? 'Enviando...' : 'Abrir câmera'}
                  <input accept="image/*" capture="environment" className="hidden" onChange={uploadProfilePhoto} type="file" />
                </label>
                <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm">
                  <Upload className="h-4 w-4 text-teal-300" />
                  {uploadingPhoto ? 'Enviando...' : 'Escolher foto'}
                  <input accept="image/*" className="hidden" onChange={uploadProfilePhoto} type="file" />
                </label>
              </div>
              {photoURL && (
                <div className="flex items-center gap-3 rounded-lg bg-slate-950/60 p-2">
                  <img alt="" className="h-14 w-14 rounded-full object-cover" src={photoURL} />
                  <span className="text-sm text-slate-300">Foto selecionada</span>
                </div>
              )}
            </div>
            <label className="grid gap-2 text-sm text-slate-300">
              Idade: {age}
              <input
                max={99}
                min={18}
                onChange={(event) => setAge(Number(event.target.value))}
                type="range"
                value={age}
              />
            </label>
            <textarea
              className="min-h-24 rounded-lg border border-white/10 bg-slate-950/60 p-3 outline-none"
              onChange={(event) => setBio(event.target.value)}
              placeholder={t('shortBioPlaceholder')}
              value={bio}
            />
          </section>
        )}

        {step === 'preferences' && (
          <section className="grid gap-3 rounded-lg border border-white/10 bg-white/8 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-teal-300" />
              {t('genderInterests')}
            </div>
            <select
              className="h-11 rounded-lg border border-white/10 bg-slate-950/60 px-3 outline-none"
              onChange={(event) => setGender(event.target.value as GenderIdentity)}
              value={gender}
            >
              {genderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.value)}
                </option>
              ))}
            </select>
            <OptionButtons
              label={t('iAm')}
              selected={sexualities}
              values={sexualityOptions}
              onToggle={(value) => setSexualities((current) => toggleValue(current, value))}
            />
            <OptionButtons
              label={t('interestedIn')}
              selected={lookingFor}
              values={genderOptions}
              onToggle={(value) => setLookingFor((current) => toggleValue(current, value))}
            />
          </section>
        )}

        {error && <p className="rounded-lg bg-rose-400/15 p-3 text-sm text-rose-100">{error}</p>}
        {step === 'profile' ? (
          <button className="h-12 rounded-lg bg-teal-300 font-semibold text-slate-950" onClick={goToPreferences} type="button">
            Continuar
          </button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <button className="h-12 rounded-lg border border-white/10 bg-white/8 px-4 font-semibold text-slate-100" onClick={() => setStep('profile')} type="button">
              Voltar
            </button>
            <button className="h-12 rounded-lg bg-teal-300 font-semibold text-slate-950" onClick={finish} type="button">
              {saving ? t('saving') : t('enterRaddo')}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

type OptionButtonsProps<T extends string> = {
  label: string;
  values: Array<{ value: T; label: string }>;
  selected: T[];
  onToggle: (value: T) => void;
};

function OptionButtons<T extends string>({ label, values, selected, onToggle }: OptionButtonsProps<T>) {
  const { t } = useI18n();

  return (
    <div className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {values.map((option) => (
          <button
            className={`min-h-10 rounded-lg px-2 text-sm ${
              selected.includes(option.value) ? 'bg-teal-300 text-slate-950' : 'border border-white/10 bg-slate-950/60 text-slate-200'
            }`}
            key={option.value}
            onClick={() => onToggle(option.value)}
            type="button"
          >
            {t(option.value)}
          </button>
        ))}
      </div>
    </div>
  );
}
