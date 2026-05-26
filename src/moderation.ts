import { useEffect, useState } from 'react';
import { isDemoMode } from './demoData';
import { supabase } from './supabase';

export type AppModeratorRole = 'admin' | 'moderator' | null;
export type ModerationRecentMessage = {
  createdAt?: string;
  id?: string;
  imageUrl?: string;
  messageType?: string;
  senderName?: string;
  senderUid?: string;
  text?: string;
};

export type ModerationCase = {
  contextId?: string;
  contextTitle?: string;
  contextType?: string;
  id: string;
  createdAt: string;
  imageUrl?: string;
  recentMessages: ModerationRecentMessage[];
  reason: string;
  reportedUid: string;
  reporterUid?: string;
  source: 'image' | 'report';
  status?: string;
  userDisplayName: string;
  userPhotoURL: string;
};

export function useAppModeratorRole(uid: string | undefined) {
  const [role, setRole] = useState<AppModeratorRole>(null);

  useEffect(() => {
    if (isDemoMode) {
      setRole('admin');
      return undefined;
    }

    if (!uid) {
      setRole(null);
      return undefined;
    }

    let active = true;

    async function loadRole() {
      const { data } = await supabase
        .from('app_moderators')
        .select('role')
        .eq('user_uid', uid)
        .maybeSingle<{ role: 'admin' | 'moderator' }>();

      if (active) setRole(data?.role ?? null);
    }

    loadRole();

    const channel = supabase
      .channel(`app-moderator-role:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_moderators', filter: `user_uid=eq.${uid}` }, loadRole)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return role;
}

export async function banAppUser(input: {
  bannedUid: string;
  bannedByUid: string;
  reason: string;
}) {
  if (isDemoMode) return;
  if (!input.bannedUid || input.bannedUid === input.bannedByUid) {
    throw new Error('UID invÃ¡lido para banimento.');
  }

  const { error } = await supabase.from('app_bans').upsert(
    {
      banned_by_uid: input.bannedByUid,
      banned_uid: input.bannedUid,
      reason: input.reason.trim() || 'violacao_das_regras',
    },
    { onConflict: 'banned_uid' },
  );

  if (error) throw new Error(error.message || 'NÃ£o consegui banir este usuÃ¡rio.');
}

export async function unbanAppUser(bannedUid: string) {
  if (isDemoMode) return;

  const { error } = await supabase.from('app_bans').delete().eq('banned_uid', bannedUid);
  if (error) throw new Error(error.message || 'NÃ£o consegui remover este banimento.');
}

export function useModerationCases(enabled: boolean) {
  const [cases, setCases] = useState<ModerationCase[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isDemoMode && enabled) {
      setCases([
        {
          id: 'demo-report-1',
          createdAt: new Date().toISOString(),
          recentMessages: [
            { id: '1', messageType: 'text', senderName: 'UsuÃ¡rio denunciado', text: 'Mensagem salva para anÃ¡lise', createdAt: new Date().toISOString() },
          ],
          reason: 'assÃ©dio',
          reportedUid: 'demo-user',
          reporterUid: 'demo-reporter',
          source: 'report',
          userDisplayName: 'UsuÃ¡rio denunciado',
          userPhotoURL: '',
        },
      ]);
      return undefined;
    }

    if (!enabled) {
      setCases([]);
      return undefined;
    }

    let active = true;

    async function loadCases() {
      setLoading(true);
      const [{ data: reports }, { data: imageReports }] = await Promise.all([
        supabase
          .from('reports')
          .select('id,reporter_uid,reported_uid,reason,recent_messages,context_type,context_id,context_title,created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('image_moderation_reports')
          .select('id,owner_uid,owner_display_name,public_url,context,reasons,recent_messages,status,created_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const reportRows = (reports ?? []) as Array<{
        context_id: string | null;
        context_title: string | null;
        context_type: string | null;
        created_at: string;
        id: string;
        reason: string;
        recent_messages: ModerationRecentMessage[] | null;
        reported_uid: string;
        reporter_uid: string;
      }>;
      const imageRows = (imageReports ?? []) as Array<{
        context: string;
        created_at: string;
        id: string;
        owner_display_name: string;
        owner_uid: string;
        public_url: string;
        reasons: string[] | null;
        recent_messages: ModerationRecentMessage[] | null;
        status: string;
      }>;
      const userIds = [
        ...new Set([
          ...reportRows.map((item) => item.reported_uid),
          ...imageRows.map((item) => item.owner_uid),
        ]),
      ].filter(Boolean);
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('id,display_name,photo_url').in('id', userIds)
        : { data: [] };
      const profileById = new Map(
        ((profiles ?? []) as Array<{ display_name: string | null; id: string; photo_url: string | null }>).map((row) => [
          row.id,
          { displayName: row.display_name || 'UsuÃ¡rio', photoURL: row.photo_url || '' },
        ]),
      );

      const nextCases: ModerationCase[] = [
        ...reportRows.map((item) => {
          const user = profileById.get(item.reported_uid);
          return {
            id: `report:${item.id}`,
            contextId: item.context_id ?? undefined,
            contextTitle: item.context_title ?? undefined,
            contextType: item.context_type ?? undefined,
            createdAt: item.created_at,
            recentMessages: item.recent_messages ?? [],
            reason: item.reason,
            reportedUid: item.reported_uid,
            reporterUid: item.reporter_uid,
            source: 'report' as const,
            userDisplayName: item.context_type === 'map_chat' ? item.context_title || 'Chat denunciado' : user?.displayName || 'Usuário denunciado',
            userPhotoURL: user?.photoURL || '',
          };
        }),
        ...imageRows.map((item) => {
          const user = profileById.get(item.owner_uid);
          return {
            id: `image:${item.id}`,
            createdAt: item.created_at,
            imageUrl: item.public_url,
            recentMessages: item.recent_messages ?? [],
            reason: item.reasons?.join(', ') || item.context,
            reportedUid: item.owner_uid,
            source: 'image' as const,
            status: item.status,
            userDisplayName: user?.displayName || item.owner_display_name || 'UsuÃ¡rio denunciado',
            userPhotoURL: user?.photoURL || '',
          };
        }),
      ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      if (active) {
        setCases(nextCases);
        setLoading(false);
      }
    }

    loadCases();

    const channel = supabase
      .channel('moderation-cases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, loadCases)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'image_moderation_reports' }, loadCases)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { cases, loading };
}

