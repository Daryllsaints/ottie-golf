// Match lifecycle helpers for Ottie Golf web-share multiplayer.
// Sessions are anonymous (UUID per browser, stored in localStorage).
// The match ID itself is the credential — anyone with the URL plays.

import { supabase } from './supabase';

const SESSION_KEY = 'ottiegolf:sessionId';

export type Match = {
    id: string;
    course_id: string;
    player_a_id: string | null;
    player_b_id: string | null;
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
    const { data, error } = await supabase
        .from('og_matches')
        .insert({ id: code, player_a_id: me, current_turn: 'A', current_hole: 1, status: 'open' })
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

    // Slot B open — claim it.
    if (!match.player_b_id) {
        const { data: updated, error: updateErr } = await supabase
            .from('og_matches')
            .update({ player_b_id: me, status: 'in_progress' })
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
