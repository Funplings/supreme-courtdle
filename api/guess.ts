import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { sql } from '@vercel/postgres';

export interface VoteCounts {
  first: number;
  second: number;
}

// GET /api/guess?docket=155  → current vote counts for a case
// POST /api/guess             → record a guess, return updated counts
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const docket = req.query.docket as string;
    if (!docket) return res.status(400).json({ error: 'docket required' });

    const counts = await kv.hgetall<Record<string, string>>(`votes:${docket}`);
    return res.status(200).json({
      first:  Number(counts?.first  ?? 0),
      second: Number(counts?.second ?? 0),
    } satisfies VoteCounts);
  }

  if (req.method === 'POST') {
    const { date, docket, guess, correct, elapsed_ms } = req.body ?? {};
    if (!docket || !guess) return res.status(400).json({ error: 'docket and guess required' });

    // Increment vote counter
    await kv.hincrby(`votes:${docket}`, guess as string, 1);
    const counts = await kv.hgetall<Record<string, string>>(`votes:${docket}`);

    // Record timing row (best-effort — don't fail the request if Postgres is unavailable)
    try {
      await sql`
        INSERT INTO guesses (date, docket, guess, correct, elapsed_ms)
        VALUES (${date}, ${docket}, ${guess}, ${correct}, ${elapsed_ms})
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
