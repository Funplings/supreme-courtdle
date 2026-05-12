import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { sql } from '@vercel/postgres';

export interface VoteCounts {
  first: number;
  second: number;
}

// GET /api/guess?docket=1962/155  → current player-vote counts for a case
// POST /api/guess                  → record a submission, return updated counts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const docket = req.query.docket as string;
    if (!docket) return res.status(400).json({ error: 'docket required' });

    const counts = await kv.hgetall<Record<string, string>>(`player_votes:${docket}`);
    return res.status(200).json({
      first:  Number(counts?.first  ?? 0),
      second: Number(counts?.second ?? 0),
    } satisfies VoteCounts);
  }

  if (req.method === 'POST') {
    const { date, docket, playerVote, justiceCorrect, justiceTotal, elapsed_ms } = req.body ?? {};
    if (!docket) return res.status(400).json({ error: 'docket required' });

    // Increment player-vote counter (only if player cast a personal vote)
    if (playerVote === 'first' || playerVote === 'second') {
      await kv.hincrby(`player_votes:${docket}`, playerVote, 1);
    }
    const counts = await kv.hgetall<Record<string, string>>(`player_votes:${docket}`);

    // Record timing + score row (best-effort)
    try {
      await sql`
        INSERT INTO guesses (date, docket, player_vote, justice_correct, justice_total, elapsed_ms)
        VALUES (${date}, ${docket}, ${playerVote ?? null}, ${justiceCorrect ?? null}, ${justiceTotal ?? null}, ${elapsed_ms ?? null})
      `;
    } catch (err) {
      console.error('Postgres insert failed:', err);
    }

    return res.status(200).json({
      first:  Number(counts?.first  ?? 0),
      second: Number(counts?.second ?? 0),
    } satisfies VoteCounts);
  }

  return res.status(405).end();
}
