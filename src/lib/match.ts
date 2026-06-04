// Match lifecycle helpers for Ottie Golf web-share multiplayer.
// Sessions are anonymous (UUID per browser, stored in localStorage).
// The match ID itself is the credential — anyone with the URL plays.

import { supabase } from './supabase';

const SESSION_KEY = 'ottiegolf:sessionId';
const NAME_KEY = 'ottiegolf:name';
const SEEN_MATCHES_KEY = 'ottiegolf:seenMatches';
const MAX_SEEN_MATCHES = 10;

export type Match = {
    id: string;
    course_id: string;
    player_a_id: string | null;
    player_b_id: string | null;
    player_a_name: string | null;
    player_b_name: string | null;
    current_turn: 'A' | 'B';
    current_hole: number;
    status: 'open' | 'in_progress' | 'complete' | 'abandoned';
    created_at: string;
    updated_at: string;
};

export type Shot = {
    id: string;
    match_id: string;
    hole: number;
    player: 'A' | 'B';
    strokes: number;
    sunk: boolean;
    oob_count: number;
    heckle_level: number;
    created_at: string;
};

/** Per-browser anonymous session id. Persisted in localStorage so the
 *  same browser is recognized as the same player across refreshes. */
export function sessionId(): string {
    try {
        let id = window.localStorage.getItem(SESSION_KEY);
        if (!id) {
            id = crypto.randomUUID();
            window.localStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        return crypto.randomUUID();
    }
}

/** Per-browser optional display name. null if the user has not set one. */
export function displayName(): string | null {
    try {
        const raw = window.localStorage.getItem(NAME_KEY);
        if (!raw) return null;
        const trimmed = raw.trim().slice(0, 24);
        return trimmed.length > 0 ? trimmed : null;
    } catch { return null; }
}

export function setDisplayName(name: string): void {
    try {
        const trimmed = name.trim().slice(0, 24);
        if (trimmed.length === 0) window.localStorage.removeItem(NAME_KEY);
        else window.localStorage.setItem(NAME_KEY, trimmed);
    } catch { /* ignore */ }
}

/** Generate a short shareable code like 'a1b2c3' for match URLs. */
export function generateMatchCode(): string {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

/** Creates a new match with the current session as player A. */
export async function createMatch(): Promise<Match | null> {
    if (!supabase) return null;
    const me = sessionId();
    const code = generateMatchCode();
    const name = displayName();
    const { data, error } = await supabase
        .from('og_matches')
        .insert({
            id: code, player_a_id: me,
            player_a_name: name,
            current_turn: 'A', current_hole: 1, status: 'open',
        })
        .select()
        .single();
    if (error) {
        console.warn('[match] create failed', error.message);
        return null;
    }
    return data as Match;
}

/** Loads a match by code. If the loader is not player A and the match
 *  has no player B yet, claim slot B automatically. */
export async function joinOrLoadMatch(code: string): Promise<{ match: Match; me: 'A' | 'B' } | null> {
    if (!supabase) return null;
    const me = sessionId();
    const { data, error } = await supabase
        .from('og_matches')
        .select()
        .eq('id', code)
        .single();
    if (error || !data) {
        console.warn('[match] load failed', error?.message);
        return null;
    }
    const match = data as Match;

    // Already player A or B in this match — just return as-is.
    if (match.player_a_id === me) return { match, me: 'A' };
    if (match.player_b_id === me) return { match, me: 'B' };

    // Slot B open — claim it and stamp our name.
    if (!match.player_b_id) {
        const myName = displayName();
        const { data: updated, error: updateErr } = await supabase
            .from('og_matches')
            .update({ player_b_id: me, player_b_name: myName, status: 'in_progress' })
            .eq('id', code)
            .select()
            .single();
        if (updateErr) {
            console.warn('[match] join failed', updateErr.message);
            return { match, me: 'B' }; // optimistic
        }
        return { match: updated as Match, me: 'B' };
    }

    // Match full and we are neither slot — spectator. For V1 treat as B
    // (read-only). Real spectator mode is a later feature.
    return { match, me: 'B' };
}

/** Records a completed hole as a shot row. heckleLevel is 0-100, the
 *  intensity this shooter pre-mashed for the NEXT player. */
export async function saveShot(matchId: string, hole: number, player: 'A' | 'B', strokes: number, sunk: boolean, oobCount: number, heckleLevel = 0): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('og_shots').insert({
        match_id: matchId,
        hole,
        player,
        strokes,
        sunk,
        oob_count: oobCount,
        heckle_level: Math.max(0, Math.min(100, Math.round(heckleLevel))),
    });
    if (error) console.warn('[match] saveShot failed', error.message);
}

/** Returns the pending heckle for me — the most recent opponent shot
 *  with heckle_level > 0, IFF I have not recorded a shot since.
 *  null means no pending heckle. */
export function pendingHeckleFor(me: 'A' | 'B', shots: Shot[]): { level: number; fromPlayer: 'A' | 'B' } | null {
    const opponent: 'A' | 'B' = me === 'A' ? 'B' : 'A';
    const lastOppHeckle = [...shots].reverse().find(s => s.player === opponent && s.heckle_level > 0);
    if (!lastOppHeckle) return null;
    const myShotsAfter = shots.filter(s => s.player === me && s.created_at > lastOppHeckle.created_at);
    if (myShotsAfter.length > 0) return null;
    return { level: lastOppHeckle.heckle_level, fromPlayer: opponent };
}

export async function loadShots(matchId: string): Promise<Shot[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('og_shots')
        .select()
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });
    if (error) {
        console.warn('[match] loadShots failed', error.message);
        return [];
    }
    return (data ?? []) as Shot[];
}

/** Returns the absolute share URL for a match code. */
export function matchUrl(code: string): string {
    if (typeof window === 'undefined') return `/m/${code}`;
    return `${window.location.origin}/m/${code}`;
}

// ─── Match history (per-browser) ──────────────────────────────────

/** Records that this browser has touched the given match id. Most
 *  recent first; capped at MAX_SEEN_MATCHES. */
export function rememberMatch(matchId: string): void {
    try {
        const raw = window.localStorage.getItem(SEEN_MATCHES_KEY);
        const list: string[] = raw ? JSON.parse(raw) : [];
        const next = [matchId, ...list.filter(x => x !== matchId)].slice(0, MAX_SEEN_MATCHES);
        window.localStorage.setItem(SEEN_MATCHES_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
}

export function rememberedMatchIds(): string[] {
    try {
        const raw = window.localStorage.getItem(SEEN_MATCHES_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list.filter(x => typeof x === 'string') : [];
    } catch { return []; }
}

export type MatchHistoryEntry = {
    matchId: string;
    me: 'A' | 'B' | null;
    myTotal: number;
    opponentTotal: number;
    opponentName: string | null;
    status: Match['status'];
    holesPlayed: number;
    totalHoles: number;
    updatedAt: string;
};

/** Load the most-recent N matches this browser has touched. Returns
 *  enriched entries with running totals and the opponent's name. */
export async function loadMatchHistory(totalHoles: number, limit = 5): Promise<MatchHistoryEntry[]> {
    if (!supabase) return [];
    const ids = rememberedMatchIds().slice(0, limit);
    if (ids.length === 0) return [];
    const meId = sessionId();

    const { data: matches, error: matchErr } = await supabase
        .from('og_matches')
        .select()
        .in('id', ids);
    if (matchErr || !matches) return [];

    const { data: allShots, error: shotsErr } = await supabase
        .from('og_shots')
        .select()
        .in('match_id', ids);
    if (shotsErr) return [];

    const entries: MatchHistoryEntry[] = [];
    for (const id of ids) {
        const m = matches.find(x => x.id === id) as Match | undefined;
        if (!m) continue;
        const me: 'A' | 'B' | null =
            m.player_a_id === meId ? 'A' :
            m.player_b_id === meId ? 'B' : null;
        if (me === null) continue;
        const myShots = (allShots ?? []).filter(s => s.match_id === id && s.player === me) as Shot[];
        const oppShots = (allShots ?? []).filter(s => s.match_id === id && s.player !== me) as Shot[];
        const myTotal = myShots.reduce((s, x) => s + x.strokes, 0);
        const opponentTotal = oppShots.reduce((s, x) => s + x.strokes, 0);
        const opponentName = me === 'A' ? m.player_b_name : m.player_a_name;
        const holesPlayed = Math.min(totalHoles, currentHoleForPlayer(me, [...myShots, ...oppShots]) - 1);
        entries.push({
            matchId: id,
            me,
            myTotal, opponentTotal,
            opponentName: opponentName ?? null,
            status: m.status,
            holesPlayed,
            totalHoles,
            updatedAt: m.updated_at,
        });
    }
    return entries;
}

/** Current hole (1-indexed) for the given player, derived from their
 *  sunk shots. Returns totalHoles + 1 if they have finished the round. */
export function currentHoleForPlayer(player: 'A' | 'B', shots: Shot[]): number {
    return shots.filter(s => s.player === player && s.sunk).length + 1;
}

/** Marks the whole match complete in the DB once both players have
 *  finished. Safe to call repeatedly. */
export async function markMatchCompleteIfDone(matchId: string, shots: Shot[], totalHoles: number): Promise<void> {
    if (!supabase) return;
    const aDone = currentHoleForPlayer('A', shots) > totalHoles;
    const bDone = currentHoleForPlayer('B', shots) > totalHoles;
    if (!(aDone && bDone)) return;
    const { error } = await supabase
        .from('og_matches')
        .update({ status: 'complete' })
        .eq('id', matchId);
    if (error) console.warn('[match] markMatchCompleteIfDone failed', error.message);
}
