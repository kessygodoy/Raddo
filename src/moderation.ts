import { useEffect, useState } from 'react';
import { isDemoMode } from './demoData';
import { signedProfilePhotoUrl } from './storageImages';
import { supabase } from './supabase';

export type AppModeratorRole = 'admin' | 'moderator' | null;
export type ModerationRecentMessage = {
  createdAt?: string;
  id?: string;
  imagePath?: string;
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
  storagePath?: string;
  userDisplayName: string;
  userPhotoURL: string;
};

export type ModerationDashboard = {
  activeBans: number;
  pushFailures24h: number;
  reports24h: number;
  spamEvents24h: number;
  repeatedReportedUsers: Array<{ count: number; uid: string }>;
};

export type AppBannedUser = {
  bannedAt: string;
  bannedByUid: string;
  displayName: string;
  photoURL: string;
  reason: string;
  uid: string;
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

    const channelName = `app-moderator-role:${uid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
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
    throw new Error('UID inválido para banimento.');
  }

  const rpcResult = await supabase.rpc('ban_app_user', {
    target_banned_uid: input.bannedUid,
    target_reason: input.reason.trim() || 'violacao_das_regras',
  });
  const missingRpc =
    rpcResult.error &&
    (rpcResult.error.code === 'PGRST202' || rpcResult.error.message.toLowerCase().includes('ban_app_user'));
  if (rpcResult.error && !missingRpc) throw new Error(rpcResult.error.message || 'Não consegui banir este usuário.');
  if (!missingRpc) return;

  const { error } = await supabase.from('app_bans').upsert(
    {
      banned_by_uid: input.bannedByUid,
      banned_uid: input.bannedUid,
      reason: input.reason.trim() || 'violacao_das_regras',
    },
    { onConflict: 'banned_uid' },
  );

  if (error) throw new Error(error.message || 'Não consegui banir este usuário.');
}

export async function unbanAppUser(bannedUid: string) {
  if (isDemoMode) return;

  const rpcResult = await supabase.rpc('unban_app_user', {
    target_banned_uid: bannedUid,
  });
  const missingRpc =
    rpcResult.error &&
    (rpcResult.error.code === 'PGRST202' || rpcResult.error.message.toLowerCase().includes('unban_app_user'));
  if (rpcResult.error && !missingRpc) throw new Error(rpcResult.error.message || 'Não consegui remover este banimento.');
  if (!missingRpc) return;

  const { error } = await supabase.from('app_bans').delete().eq('banned_uid', bannedUid);
  if (error) throw new Error(error.message || 'Não consegui remover este banimento.');
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
            { id: '1', messageType: 'text', senderName: 'Usuário denunciado', text: 'Mensagem salva para análise', createdAt: new Date().toISOString() },
          ],
          reason: 'assédio',
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
          .select('id,owner_uid,owner_display_name,public_url,storage_path,context,reasons,recent_messages,status,created_at')
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
        storage_path: string;
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

      const imageCases = await Promise.all(
        imageRows.map(async (item) => {
          const user = profileById.get(item.owner_uid);
          const imageUrl = item.storage_path
            ? await signedProfilePhotoUrl(item.storage_path, { encryptedCache: false })
            : item.public_url;
          return {
            id: `image:${item.id}`,
            createdAt: item.created_at,
            imageUrl,
            recentMessages: item.recent_messages ?? [],
            reason: item.reasons?.join(', ') || item.context,
            reportedUid: item.owner_uid,
            source: 'image' as const,
            status: item.status,
            storagePath: item.storage_path,
            userDisplayName: user?.displayName || item.owner_display_name || 'Usuário denunciado',
            userPhotoURL: user?.photoURL || '',
          };
        }),
      );

      async function signedEvidenceMessages(messages: ModerationRecentMessage[]) {
        return Promise.all(
          messages.map(async (message) => ({
            ...message,
            imageUrl: message.imagePath ? await signedProfilePhotoUrl(message.imagePath, { encryptedCache: false }) : message.imageUrl,
          })),
        );
      }

      const reportCases = await Promise.all(
        reportRows.map(async (item) => {
          const user = profileById.get(item.reported_uid);
          return {
            id: `report:${item.id}`,
            contextId: item.context_id ?? undefined,
            contextTitle: item.context_title ?? undefined,
            contextType: item.context_type ?? undefined,
            createdAt: item.created_at,
            recentMessages: await signedEvidenceMessages(item.recent_messages ?? []),
            reason: item.reason,
            reportedUid: item.reported_uid,
            reporterUid: item.reporter_uid,
            source: 'report' as const,
            userDisplayName: item.context_type === 'map_chat' ? item.context_title || 'Chat denunciado' : user?.displayName || 'Usuário denunciado',
            userPhotoURL: user?.photoURL || '',
          };
        }),
      );

      const nextCases: ModerationCase[] = [
        ...reportCases,
        ...imageCases,
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

export function useModerationDashboard(enabled: boolean) {
  const [dashboard, setDashboard] = useState<ModerationDashboard>({
    activeBans: 0,
    pushFailures24h: 0,
    reports24h: 0,
    spamEvents24h: 0,
    repeatedReportedUsers: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDashboard({ activeBans: 0, pushFailures24h: 0, reports24h: 0, spamEvents24h: 0, repeatedReportedUsers: [] });
      return undefined;
    }

    if (isDemoMode) {
      setDashboard({
        activeBans: 1,
        pushFailures24h: 0,
        reports24h: 2,
        spamEvents24h: 3,
        repeatedReportedUsers: [{ count: 2, uid: 'demo-user' }],
      });
      return undefined;
    }

    let active = true;

    async function loadDashboard() {
      setLoading(true);
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [reportsResult, bansResult, pushResult, spamResult] = await Promise.all([
        supabase.from('reports').select('reported_uid,created_at').gte('created_at', since24h).limit(500),
        supabase.from('app_bans').select('banned_uid', { count: 'exact', head: true }),
        supabase.from('push_delivery_logs').select('status,created_at').gte('created_at', since24h).limit(500),
        supabase.from('anti_spam_events').select('created_at').gte('created_at', since24h).limit(500),
      ]);

      if (!active) return;

      const reportedCounts = new Map<string, number>();
      ((reportsResult.data ?? []) as Array<{ reported_uid: string }>).forEach((row) => {
        reportedCounts.set(row.reported_uid, (reportedCounts.get(row.reported_uid) ?? 0) + 1);
      });

      setDashboard({
        activeBans: bansResult.count ?? 0,
        pushFailures24h: ((pushResult.data ?? []) as Array<{ status: string }>).filter((row) => row.status !== 'sent').length,
        reports24h: reportsResult.data?.length ?? 0,
        spamEvents24h: spamResult.error ? 0 : (spamResult.data?.length ?? 0),
        repeatedReportedUsers: [...reportedCounts.entries()]
          .filter(([, count]) => count >= 2)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([uid, count]) => ({ count, uid })),
      });
      setLoading(false);
    }

    loadDashboard();
    const timer = window.setInterval(loadDashboard, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return { dashboard, loading };
}

export function useAppBannedUsers(enabled: boolean) {
  const [bannedUsers, setBannedUsers] = useState<AppBannedUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setBannedUsers([]);
      return undefined;
    }

    if (isDemoMode) {
      setBannedUsers([
        {
          bannedAt: new Date().toISOString(),
          bannedByUid: 'demo-admin',
          displayName: 'Usuário banido',
          photoURL: '',
          reason: 'spam',
          uid: 'demo-user',
        },
      ]);
      return undefined;
    }

    let active = true;

    async function loadBannedUsers() {
      setLoading(true);
      const { data: bans } = await supabase
        .from('app_bans')
        .select('banned_uid,banned_by_uid,reason,created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      const rows = (bans ?? []) as Array<{
        banned_by_uid: string;
        banned_uid: string;
        created_at: string;
        reason: string;
      }>;
      const ids = rows.map((row) => row.banned_uid);
      const { data: profiles } = ids.length
        ? await supabase.from('profiles').select('id,display_name,photo_url').in('id', ids)
        : { data: [] };
      const profileById = new Map(
        ((profiles ?? []) as Array<{ display_name: string | null; id: string; photo_url: string | null }>).map((row) => [
          row.id,
          row,
        ]),
      );

      if (!active) return;
      setBannedUsers(
        rows.map((row) => {
          const bannedProfile = profileById.get(row.banned_uid);
          return {
            bannedAt: row.created_at,
            bannedByUid: row.banned_by_uid,
            displayName: bannedProfile?.display_name || `Usuário ${row.banned_uid.slice(0, 8)}`,
            photoURL: bannedProfile?.photo_url || '',
            reason: row.reason,
            uid: row.banned_uid,
          };
        }),
      );
      setLoading(false);
    }

    loadBannedUsers();
    const channel = supabase
      .channel('app-bans-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_bans' }, loadBannedUsers)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { bannedUsers, loading };
}

