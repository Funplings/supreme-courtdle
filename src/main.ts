import './style.css';
import type { AppState, CaseData, Guess, JusticeGuesses, JusticeInfo, VoteCounts } from './types';
import { getDailyCase, updateStreak } from './game';
import { inject } from '@vercel/analytics';

inject();

const loadTime = Date.now();

// ─── Justice data & name matching ────────────────────────────────────────────

let justiceData: Record<string, JusticeInfo> = {};
const justiceIndex = new Map<string, string>();
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

function nameKey(name: string): string {
  const words = name.replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
  const suffixParts: string[] = [];
  let i = words.length - 1;
  while (i >= 0 && SUFFIXES.has(words[i].toLowerCase())) {
    suffixParts.unshift(words[i].toLowerCase());
    i--;
  }
  const lastName = i >= 0 ? words[i].toLowerCase() : '';
  return suffixParts.length ? `${lastName}_${suffixParts.join('_')}` : lastName;
}

function buildJusticeIndex(): void {
  for (const fullName of Object.keys(justiceData)) {
    const key = nameKey(fullName);
    if (key) justiceIndex.set(key, fullName);
  }
}

function findJustice(apiName: string): JusticeInfo | null {
  const key = nameKey(apiName);
  const fullName = justiceIndex.get(key);
  return fullName ? (justiceData[fullName] ?? null) : null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLACEHOLDER = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e7e5e4'/><circle cx='50' cy='38' r='18' fill='%23a8a29e'/><ellipse cx='50' cy='84' rx='30' ry='22' fill='%23a8a29e'/></svg>`;

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ─── Legal term tooltips ─────────────────────────────────────────────────────

const LEGAL_TERMS: Record<string, string> = {
  // Constitutional Amendments
  'first amendment':         'Protects freedom of speech, religion, press, peaceful assembly, and the right to petition the government.',
  'second amendment':        'Protects the right of the people to keep and bear arms.',
  'third amendment':         'Prohibits the government from forcing citizens to house soldiers in peacetime without consent.',
  'fourth amendment':        'Protects against unreasonable searches and seizures; requires warrants to be supported by probable cause.',
  'fifth amendment':         'Protects against self-incrimination and double jeopardy; guarantees due process; prohibits taking private property without just compensation.',
  'sixth amendment':         'Guarantees the right to a speedy and public trial, an impartial jury, to confront witnesses, and to have the assistance of counsel.',
  'seventh amendment':       'Preserves the right to a jury trial in federal civil cases involving more than $20.',
  'eighth amendment':        'Prohibits excessive bail, excessive fines, and cruel and unusual punishment.',
  'ninth amendment':         'Clarifies that rights listed in the Constitution are not the only rights retained by the people.',
  'tenth amendment':         'Reserves powers not delegated to the federal government to the states or to the people.',
  'eleventh amendment':      'Limits the ability of individuals to sue states in federal court; establishes state sovereign immunity.',
  'twelfth amendment':       'Revised the electoral college procedure, requiring separate ballots for President and Vice President.',
  'thirteenth amendment':    'Abolished slavery and involuntary servitude, except as punishment for a crime.',
  'fourteenth amendment':    'Grants citizenship to all persons born or naturalized in the U.S.; guarantees due process and equal protection against state action.',
  'fifteenth amendment':     'Prohibits denying the right to vote based on race, color, or previous condition of servitude.',
  'sixteenth amendment':     'Grants Congress the power to levy a federal income tax.',
  'seventeenth amendment':   'Established direct election of U.S. Senators by popular vote.',
  'eighteenth amendment':    'Prohibited the manufacture, sale, and transportation of alcohol (Prohibition). Later repealed by the Twenty-First Amendment.',
  'nineteenth amendment':    'Prohibits denying the right to vote on the basis of sex, effectively granting women\'s suffrage.',
  'twentieth amendment':     'Moved the start of presidential and congressional terms, reducing the "lame duck" period after elections.',
  'twenty-first amendment':  'Repealed the Eighteenth Amendment, ending Prohibition.',
  'twenty-second amendment': 'Limits the President to two terms in office.',
  'twenty-third amendment':  'Grants residents of Washington, D.C. the right to vote in presidential elections.',
  'twenty-fourth amendment': 'Prohibits poll taxes as a condition of voting in federal elections.',
  'twenty-fifth amendment':  'Establishes the order of presidential succession and procedures for addressing presidential disability.',
  'twenty-sixth amendment':  'Lowered the voting age to 18 for all elections.',
  'twenty-seventh amendment':'Prevents laws changing congressional pay from taking effect until after the next election.',

  // Legal terms
  'habeas corpus':      'Latin for "you shall have the body." A court order requiring a detained person to be brought before a judge.',
  'amicus curiae':      'Latin for "friend of the court." A party not involved in the case who files a brief to offer relevant information.',
  'per curiam':         'Latin for "by the court." An opinion issued in the name of the court collectively, without a named author.',
  'stare decisis':      'Latin for "to stand by things decided." The doctrine of following precedent from prior rulings.',
  'due process':        'The constitutional guarantee that the government must respect all legal rights owed to a person before depriving them of life, liberty, or property.',
  'equal protection':   'A 14th Amendment requirement that states apply the law equally to all persons without arbitrary discrimination.',
  'probable cause':     'A reasonable basis to believe a crime has been committed, required before police may make an arrest or conduct a search.',
  'double jeopardy':    'Being tried twice for the same offense, prohibited by the Fifth Amendment.',
  'self-incrimination': 'Being compelled to testify against oneself. The Fifth Amendment protects against this.',
  'eminent domain':     'Government power to take private property for public use, provided just compensation is paid.',
  'commerce clause':    'Article I power granting Congress the authority to regulate trade among states and with foreign nations.',
  'supremacy clause':   'Article VI provision establishing that the Constitution and federal law take precedence over conflicting state law.',
  'establishment clause': 'First Amendment clause prohibiting the government from establishing an official religion.',
  'free exercise':      'First Amendment right to practice one\'s religion without government interference.',
  'strict scrutiny':    'The highest level of judicial review, applied to laws affecting fundamental rights or suspect classifications like race. The government must prove a compelling interest.',
  'rational basis':     'The lowest level of judicial review. A law is upheld if it is rationally related to a legitimate government interest.',
  'certiorari':         'A court order granting review of a lower court\'s decision. The Supreme Court has discretion over whether to grant it.',
  'jurisdiction':       'The legal authority of a court to hear and decide a particular case.',
  'injunction':         'A court order requiring a party to take or refrain from a specific action.',
  'remand':             'To send a case back to a lower court for further proceedings consistent with the higher court\'s ruling.',
  'precedent':          'A prior court decision that guides how future similar cases should be decided.',
  'standing':           'The legal right to bring a lawsuit. A party must show they suffered a concrete, personal injury.',
  'moot':               'A case is moot when the issue has already been resolved and a court ruling would have no practical effect.',
  'writ':               'A formal written court order commanding or prohibiting a specific action.',
  'indictment':         'A formal charge of a serious crime, typically issued by a grand jury after reviewing evidence.',
  'grand jury':         'A group of citizens who review evidence to decide whether a formal criminal charge should be brought.',
  'counsel':            'A lawyer representing a party in legal proceedings. The Sixth Amendment guarantees the right to counsel.',
  'petitioner':         'The party who brings a case to the Supreme Court, typically by filing a petition for certiorari.',
  'respondent':         'The party opposing the petitioner; the side that prevailed in the court below.',
  'appellant':          'The party who lost in the lower court and is now appealing the decision.',
  'appellee':           'The party who won in the lower court and defends the decision on appeal.',
  'plurality':          'An opinion that receives more votes than any other but not an outright majority of the court.',
  'unconstitutional':   'In violation of or not authorized by the Constitution.',
  'dissent':            'A written opinion by one or more justices who disagree with the majority\'s decision or reasoning.',
  'dissenting':         'Disagreeing with the majority\'s ruling. A dissenting justice voted on the losing side and may write a dissenting opinion explaining their disagreement.',
  'concurrence':        'An opinion agreeing with the majority\'s outcome but offering different or additional reasoning.',
};

const _termPattern = new RegExp(
  `\\b(${Object.keys(LEGAL_TERMS)
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi',
);

function highlightTerms(html: string): string {
  return html.replace(/(<[^>]*>|[^<]+)/g, (chunk) => {
    if (chunk.startsWith('<')) return chunk;
    return chunk.replace(_termPattern, (match) => {
      const def = LEGAL_TERMS[match.toLowerCase()];
      if (!def) return match;
      const escaped = def.replace(/"/g, '&quot;');
      return `<span class="term-tip" data-def="${escaped}">${match}</span>`;
    });
  });
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'supreme_courtdle_daily';
type StoredState = Omit<AppState, 'cases'>;

function saveState(state: AppState): void {
  const { cases: _cases, ...toSave } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function loadStoredState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    // Reject old format (had 'guesses' array instead of 'justiceGuesses')
    if (!('justiceGuesses' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function justiceVoteSide(vote: string, winner: 'first' | 'second'): Guess | null {
  const v = vote.toLowerCase();
  if (['majority', 'concurrence', 'special concurrence', 'plurality'].includes(v)) return winner;
  if (['dissent', 'minority'].includes(v)) return winner === 'first' ? 'second' : 'first';
  return null;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderHeader(): string {
  return `
    <header class="mb-6">
      <h1 class="text-2xl font-serif font-bold text-navy leading-none">⚖️ supreme-courtdle</h1>
      <p class="text-xs text-stone-400 tracking-widest uppercase mt-4">Daily Supreme Court Case Quiz</p>
    </header>
  `;
}

// ─── Justices ────────────────────────────────────────────────────────────────

function justiceImagePath(name: string): string {
  const safe = name.replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '_');
  return `/assets/images/${safe}.png`;
}

const VOTE_STYLE: Record<string, { label: string; ring: string; badge: string }> = {
  'majority':            { label: 'Majority',  ring: 'border-emerald-400', badge: 'bg-emerald-500' },
  'dissent':             { label: 'Dissent',   ring: 'border-rose-400',    badge: 'bg-rose-500'   },
  'minority':            { label: 'Dissent',   ring: 'border-rose-400',    badge: 'bg-rose-500'   },
  'concurrence':         { label: 'Concur',    ring: 'border-amber-400',   badge: 'bg-amber-400'  },
  'special concurrence': { label: 'Concur',    ring: 'border-amber-400',   badge: 'bg-amber-400'  },
  'plurality':           { label: 'Plurality', ring: 'border-sky-400',     badge: 'bg-sky-500'    },
};

function buildJusticeTooltip(name: string): string {
  const info = findJustice(name);
  if (!info) return '';
  const t = info.terms[0];
  const role   = t?.role ?? 'Justice';
  const apptBy = t?.appointed_by ?? (info.appointed_by[0] ?? '');
  const start  = t?.start ?? '';
  const end    = t?.end ?? 'present';
  return `<div class="justice-tooltip">
    <div style="font-weight:600;margin-bottom:3px">${role}</div>
    <div>Appointed by ${apptBy}</div>
    <div style="opacity:0.75;font-size:12px;margin-top:2px">${start}–${end}</div>
  </div>`;
}

// Playing state: one row per justice with full party name buttons
function renderJusticeVoting(c: CaseData, justiceGuesses: JusticeGuesses): string {
  const votes = (c.decisions[0]?.votes ?? []).filter(v => v.vote?.toLowerCase() !== 'none');
  if (!votes.length) return '';

  const fp = c.first_party  ?? 'First Party';
  const sp = c.second_party ?? 'Second Party';

  const rows = votes.map(v => {
    const name    = v.name ?? 'Unknown';
    const src     = justiceImagePath(name);
    const guess   = justiceGuesses[name];
    const ring    = guess === 'first' ? 'border-navy' : guess === 'second' ? 'border-gold' : 'border-stone-200';
    const tooltip = buildJusticeTooltip(name);
    const safe    = escAttr(name);

    const btnCls = (side: 'first' | 'second') => {
      const active = guess === side;
      if (side === 'first') return active ? 'bg-navy text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200';
      return active ? 'bg-gold text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200';
    };

    return `
      <div>
        <div class="mb-1">
          <span class="text-base font-serif font-semibold text-stone-600 leading-tight">${name}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 5fr;gap:0.75rem">
          <div class="relative justice-wrap cursor-help">
            ${tooltip}
            <img src="${src}" alt="${safe}"
                 class="w-full aspect-square rounded-lg object-cover border-2 ${ring} bg-stone-100 transition-colors"
                 onerror="this.src='${PLACEHOLDER}'" />
          </div>
          <div class="flex gap-1.5">
            <button data-action="justice-guess" data-justice="${safe}" data-side="first"
              class="flex-1 h-full text-base font-serif font-semibold px-2 rounded transition-colors text-center leading-tight ${btnCls('first')}">${fp}</button>
            <button data-action="justice-guess" data-justice="${safe}" data-side="second"
              class="flex-1 h-full text-base font-serif font-semibold px-2 rounded transition-colors text-center leading-tight ${btnCls('second')}">${sp}</button>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div>
      <p class="text-xs uppercase tracking-widest text-stone-400 mb-3">How did each justice vote?</p>
      <div class="flex flex-col gap-5">${rows}</div>
    </div>`;
}

// Revealed state: actual votes + correct/wrong overlays
function renderJustices(c: CaseData, justiceGuesses: JusticeGuesses): string {
  const votes = (c.decisions[0]?.votes ?? []).filter(v => v.vote?.toLowerCase() !== 'none');
  if (!votes.length) return '';
  const winner = c.winner as 'first' | 'second' | null;
  const fp = c.first_party  ?? 'First Party';
  const sp = c.second_party ?? 'Second Party';

  const rows = votes.map(v => {
    const name    = v.name ?? 'Unknown';
    const src     = justiceImagePath(name);
    const voteKey = (v.vote ?? '').toLowerCase();
    const style   = VOTE_STYLE[voteKey];
    const actual  = winner ? justiceVoteSide(v.vote ?? '', winner) : null;
    const guess   = justiceGuesses[name];
    const safe    = escAttr(name);

    const correct = !!(guess && actual && guess === actual);
    const wrong   = !!(guess && actual && guess !== actual);

    const ring = correct ? 'border-emerald-400' : wrong ? 'border-rose-400' : 'border-stone-200';

    const overlay = correct
      ? `<span class="absolute top-0.5 right-0.5 text-sm leading-none text-emerald-500 font-bold drop-shadow">✓</span>`
      : wrong
      ? `<span class="absolute top-0.5 right-0.5 text-sm leading-none text-rose-500 font-bold drop-shadow">✗</span>`
      : '';

    const tooltip = buildJusticeTooltip(name);

    const sideCls = (side: 'first' | 'second') => {
      const isActual = actual === side;
      const isGuess  = guess  === side;
      const baseLayout = 'flex-1 h-full text-base font-serif font-semibold px-2 rounded text-center leading-tight flex flex-col items-center justify-center gap-0.5';
      if (isActual && isGuess)  return `${baseLayout} ${side === 'first' ? 'bg-navy text-white' : 'bg-gold text-white'}`;
      if (isActual && !isGuess) return `${baseLayout} ${side === 'first' ? 'bg-navy/20 text-navy' : 'bg-gold/20 text-amber-800'}`;
      if (!isActual && isGuess) return `${baseLayout} bg-rose-100 text-rose-700`;
      return `${baseLayout} bg-stone-100 text-stone-400`;
    };

    const voteLabel = style
      ? `<span class="text-[10px] font-sans font-semibold opacity-70 uppercase tracking-wide">${style.label}</span>`
      : '';

    return `
      <div>
        <div class="mb-1">
          <span class="text-base font-serif font-semibold text-stone-600 leading-tight">${name}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 5fr;gap:0.75rem">
          <div class="relative justice-wrap cursor-help">
            ${tooltip}
            <img src="${src}" alt="${safe}"
                 class="w-full aspect-square rounded-lg object-cover border-2 ${ring} bg-stone-100"
                 onerror="this.src='${PLACEHOLDER}'" />
            ${overlay}
          </div>
          <div class="flex gap-1.5">
            <div class="${sideCls('first')}">${fp}${actual === 'first' ? voteLabel : ''}</div>
            <div class="${sideCls('second')}">${sp}${actual === 'second' ? voteLabel : ''}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="bg-white rounded-lg shadow-sm border border-stone-100 p-6 mb-4 fade-up">
      <p class="text-xs uppercase tracking-widest text-stone-400 mb-3">The Vote</p>
      <div class="flex flex-col gap-5">${rows}</div>
    </div>`;
}

// Player's own side pick
function renderPlayerVoteSection(c: CaseData, playerVote: Guess | null): string {
  const fp  = c.first_party  ?? 'First Party';
  const sp  = c.second_party ?? 'Second Party';
  const fpl = c.first_party_label  ?? 'Petitioner';
  const spl = c.second_party_label ?? 'Respondent';

  const btnCls = (side: 'first' | 'second') => {
    if (playerVote !== side) return 'bg-white text-navy border-stone-200 hover:border-navy/50';
    return side === 'first' ? 'bg-navy text-white border-navy' : 'bg-gold text-white border-gold';
  };

  return `
    <div class="mt-5 pt-4 border-t border-stone-100">
      <p class="text-xs uppercase tracking-widest text-stone-400 mb-3">How would YOU have voted?</p>
      <div class="grid grid-cols-2 gap-3">
        <button data-action="player-vote" data-side="first"
          class="rounded-lg p-3 text-center border transition-all duration-150 cursor-pointer ${btnCls('first')}">
          <div class="text-xs uppercase tracking-wide opacity-60 mb-1">${fpl}</div>
          <div class="font-serif font-bold text-sm leading-tight">${fp}</div>
        </button>
        <button data-action="player-vote" data-side="second"
          class="rounded-lg p-3 text-center border transition-all duration-150 cursor-pointer ${btnCls('second')}">
          <div class="text-xs uppercase tracking-wide opacity-60 mb-1">${spl}</div>
          <div class="font-serif font-bold text-sm leading-tight">${sp}</div>
        </button>
      </div>
    </div>`;
}

// ─── Case card ───────────────────────────────────────────────────────────────

const JURISDICTION_TOOLTIPS: Record<string, string> = {
  'Writ of certiorari':    'The Supreme Court chose to hear this case at its own discretion. At least four justices must agree to grant the petition.',
  'Appeal':                'A lower court\'s decision was challenged and the Supreme Court was obligated to hear it.',
  'Original jurisdiction': 'The case was filed directly in the Supreme Court without going through lower courts, typically for disputes between states.',
  'Other':                 'The case reached the Supreme Court through an alternative procedural route.',
};

function renderCaseCard(c: CaseData): string {
  const jurisdiction = c.manner_of_jurisdiction ?? '';
  const facts    = highlightTerms(c.facts_of_the_case ?? '<em>No background available.</em>');
  const question = highlightTerms(c.question ?? '<em>No question available.</em>');

  const jTooltip = JURISDICTION_TOOLTIPS[jurisdiction];
  const jurisdictionValue = jTooltip
    ? `<span class="term-tip" data-def="${jTooltip.replace(/"/g, '&quot;')}">${jurisdiction}</span>`
    : jurisdiction;

  const year = c.oyez_url ? c.oyez_url.replace(/\/$/, '').split('/').slice(-2, -1)[0] : null;

  return `
    <div class="bg-white rounded-lg shadow-sm border border-stone-100 p-6 mb-4">
      ${year ? `<p class="text-base uppercase tracking-widest text-stone-400 mb-2">${year}</p>` : ''}
      <h2 class="text-3xl font-serif font-bold text-navy mb-5 leading-snug">${c.name ?? 'Unknown Case'}</h2>
      ${jurisdiction ? `
      <div class="mb-5">
        <p class="text-xs uppercase tracking-widest text-stone-400 mb-1">Jurisdiction</p>
        <p class="text-sm text-stone-600">${jurisdictionValue}</p>
      </div>` : ''}
      <div class="mb-5">
        <p class="text-xs uppercase tracking-widest text-stone-400 mb-2">Background</p>
        <div class="text-stone-600 text-sm leading-relaxed case-content">${facts}</div>
      </div>
      <div>
        <p class="text-xs uppercase tracking-widest text-stone-400 mb-2">The Question</p>
        <div class="text-stone-600 text-sm leading-relaxed case-content">${question}</div>
      </div>
    </div>
  `;
}

// ─── Vote bar ─────────────────────────────────────────────────────────────────

function renderVoteBar(state: AppState): string {
  const vc = state.voteCounts;
  if (!vc) return '';
  const c = state.cases[state.currentIndex];
  const total = vc.first + vc.second;
  if (total === 0) return '';
  const firstPct  = Math.round((vc.first / total) * 100);
  const secondPct = 100 - firstPct;
  const fp = c.first_party  ?? 'First Party';
  const sp = c.second_party ?? 'Second Party';
  return `
    <div class="bg-white rounded-lg shadow-sm border border-stone-100 p-6 mb-4 fade-up">
      <p class="text-xs uppercase tracking-widest text-stone-400 mb-3">How others would've voted <span class="normal-case font-medium text-stone-500">(${total.toLocaleString()} ${total === 1 ? 'player' : 'players'})</span></p>
      <div class="flex rounded-full overflow-hidden h-7 text-sm font-semibold mb-2">
        <div class="flex items-center justify-center bg-navy text-white transition-all"
             style="width:${firstPct}%">${firstPct > 12 ? firstPct + '%' : ''}</div>
        <div class="flex items-center justify-center bg-gold text-white transition-all"
             style="width:${secondPct}%">${secondPct > 12 ? secondPct + '%' : ''}</div>
      </div>
      <div class="flex justify-between text-xs text-stone-500 font-serif font-semibold">
        <span>${fp} — ${firstPct}%</span>
        <span>${secondPct}% — ${sp}</span>
      </div>
    </div>`;
}

// ─── Revealed ────────────────────────────────────────────────────────────────

function renderRevealed(state: AppState): string {
  const c      = state.cases[state.currentIndex];
  const jg     = state.justiceGuesses[state.currentIndex] ?? {};
  const pv     = state.playerVote[state.currentIndex];
  const winner = c.winner as 'first' | 'second' | null;

  // Compute justice score
  const votes = c.decisions[0]?.votes ?? [];
  let correct = 0;
  let total   = 0;
  for (const v of votes) {
    const name   = v.name ?? '';
    const guess  = jg[name];
    const actual = winner ? justiceVoteSide(v.vote ?? '', winner) : null;
    if (guess && actual) { total++; if (guess === actual) correct++; }
  }

  const allCorrect = total > 0 && correct === total;
  const mostCorrect = correct > total / 2;
  const icon     = allCorrect ? '🎯' : mostCorrect ? '⚖️' : '📚';
  const headline = allCorrect ? 'Perfect score!' : `${correct} of ${total} justices correct`;
  const resultClass = mostCorrect ? 'result-correct' : 'result-wrong';

  const winnerName = winner === 'first' ? c.first_party : c.second_party;

  const playerParty = pv === 'first' ? c.first_party : pv === 'second' ? c.second_party : null;
  const playerCorrect = pv && winner && pv === winner;
  const playerLine = pv && playerParty
    ? `<p class="text-sm mt-2">You would've voted for <strong>${playerParty}</strong> — ${playerCorrect ? 'the winning side.' : 'the dissenting side.'}</p>`
    : '';

  const conclusionHtml = c.conclusion
    ? `<div class="text-sm leading-relaxed case-content mt-3 pt-3 border-t border-current/20 opacity-80">${highlightTerms(c.conclusion)}</div>`
    : '';

  return `
    ${renderCaseCard(c)}
    ${renderJustices(c, jg)}
    <div class="rounded-lg border p-4 mb-4 fade-up ${resultClass}">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-lg">${icon}</span>
        <span class="font-serif font-bold text-lg">${headline}</span>
      </div>
      <p class="text-sm"><strong>${winnerName}</strong> prevailed.</p>
      ${playerLine}
      ${conclusionHtml}
    </div>
    ${renderVoteBar(state)}
    ${c.oyez_url ? `
      <a href="${c.oyez_url}" target="_blank" rel="noopener noreferrer"
         class="flex items-center justify-center gap-1.5 text-xs text-stone-400 hover:text-navy transition-colors mt-2 fade-up">
        View full case on Oyez ↗
      </a>` : ''}
    <h2 class="text-center text-lg font-serif font-bold text-navy mt-6 fade-up">Come back tomorrow for a new Supreme Court case!</h2>
  `;
}

// ─── Main render ─────────────────────────────────────────────────────────────

function render(state: AppState): void {
  const scrollY = window.scrollY;
  const app = document.getElementById('app')!;
  const c   = state.cases[state.currentIndex];
  const jg  = state.justiceGuesses[state.currentIndex] ?? {};
  const pv  = state.playerVote[state.currentIndex];

  let body: string;
  if (state.phase === 'revealed') {
    body = renderRevealed(state);
  } else {
    const votes = (c.decisions[0]?.votes ?? []).filter(v => v.vote?.toLowerCase() !== 'none');
    const allJusticesGuessed = votes.length > 0 && votes.every(v => v.name && jg[v.name] !== undefined);
    const allGuessed = allJusticesGuessed && pv !== null;

    const submitBtn = allGuessed
      ? `<button data-action="submit"
           class="w-full bg-navy text-white rounded-lg py-3 font-serif font-bold text-base mt-5
                  hover:bg-navy/90 active:scale-[0.97] transition-all cursor-pointer">
           Submit Predictions
         </button>`
      : `<button disabled
           class="w-full bg-stone-100 text-stone-400 rounded-lg py-3 font-serif font-bold text-base mt-5 cursor-not-allowed">
           ${!allJusticesGuessed ? 'Predict all justices to submit' : 'Choose your own vote to submit'}
         </button>`;

    body = `
      ${renderCaseCard(c)}
      <div class="bg-white rounded-lg shadow-sm border border-stone-100 p-6 mb-4">
        ${renderJusticeVoting(c, jg)}
        ${renderPlayerVoteSection(c, pv)}
        ${submitBtn}
      </div>
    `;
  }

  app.innerHTML = `
    <div class="max-w-3xl mx-auto px-4 py-8 pb-4">
      <div class="text-right text-base text-navy mb-5">
        created by <a href="https://funplings.github.io/" target="_blank" rel="noopener noreferrer"
           class="font-bold underline">funplings ↗</a>
      </div>
      ${renderHeader()}
      ${body}
    </div>
    <footer class="text-center text-xs text-stone-400 py-6 border-t border-stone-200 mt-4">
      <p>Case information sourced from <a href="https://www.oyez.org" target="_blank" rel="noopener noreferrer" class="underline hover:text-navy transition-colors">Oyez</a>, a free law project.</p>
      <p class="mt-1">© 2026 Funplings</p>
    </footer>
  `;
  window.scrollTo(0, scrollY);
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchVoteCounts(docket: string): Promise<VoteCounts> {
  try {
    const res = await fetch(`/api/guess?docket=${encodeURIComponent(docket)}`);
    if (!res.ok) return { first: 0, second: 0 };
    return await res.json() as VoteCounts;
  } catch {
    return { first: 0, second: 0 };
  }
}

async function postGuess(
  date: string, docket: string, playerVote: Guess | null,
  justiceCorrect: number, justiceTotal: number, elapsed_ms: number,
): Promise<VoteCounts> {
  try {
    const res = await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, docket, playerVote, justiceCorrect, justiceTotal, elapsed_ms }),
    });
    if (!res.ok) return { first: 0, second: 0 };
    return await res.json() as VoteCounts;
  } catch {
    return { first: 0, second: 0 };
  }
}

// ─── Events ──────────────────────────────────────────────────────────────────

function handleJusticeGuess(state: AppState, justiceName: string, side: Guess): AppState {
  const idx = state.currentIndex;
  const jg  = { ...state.justiceGuesses[idx], [justiceName]: side };
  const justiceGuesses = [...state.justiceGuesses];
  justiceGuesses[idx] = jg;
  return { ...state, justiceGuesses };
}

function handlePlayerVote(state: AppState, side: Guess): AppState {
  const playerVote = [...state.playerVote];
  // Toggle off if same side tapped again
  playerVote[state.currentIndex] = playerVote[state.currentIndex] === side ? null : side;
  return { ...state, playerVote };
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

function spawnConfetti(): void {
  const EMOJIS = ['🎉', '🎊', '✨', '🏛️', '⚖️', '🎈', '🥳'];
  const COUNT = 200;
  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('span');
    el.className = 'confetti-piece';
    el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    el.style.left = `${Math.random() * 100}vw`;
    el.style.top  = `-${60 + Math.random() * 60}px`;
    el.style.animationDuration = `${0.8 + Math.random() * 0.8}s`;
    el.style.animationDelay    = `${Math.random() * 0.3}s`;
    el.style.fontSize = `${1 + Math.random() * 1.2}rem`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ─── Tooltip viewport correction ─────────────────────────────────────────────

function adjustTooltip(el: HTMLElement, tooltipWidth: number): void {
  const rect = el.getBoundingClientRect();
  const pad  = 8;
  const centerX   = rect.left + rect.width / 2;
  const leftEdge  = centerX - tooltipWidth / 2;
  const rightEdge = centerX + tooltipWidth / 2;

  let correction = 0;
  if (rightEdge > window.innerWidth - pad) correction = -(rightEdge - (window.innerWidth - pad));
  else if (leftEdge < pad)                 correction = pad - leftEdge;

  if (correction !== 0) el.style.setProperty('--tip-x', `${Math.round(correction)}px`);
  else                  el.style.removeProperty('--tip-x');
}

function setupTooltipListeners(): void {
  const handler = (e: Event) => {
    const target = e.target as Element;
    const tip  = target.closest<HTMLElement>('.term-tip');
    if (tip)  adjustTooltip(tip, 240);
    const wrap = target.closest<HTMLElement>('.justice-wrap');
    if (wrap) adjustTooltip(wrap, 220);
  };
  document.addEventListener('mouseover', handler);
  document.addEventListener('touchstart', handler, { passive: true });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const [allCases, schedule, justices] = await Promise.all([
    fetch('/cases.json').then(r => r.json()) as Promise<Record<string, CaseData>>,
    fetch('/schedule.json').then(r => r.json()) as Promise<Record<string, string>>,
    fetch('/justices.json').then(r => r.json()).catch(() => ({})) as Promise<Record<string, JusticeInfo>>,
  ]);
  justiceData = justices;
  buildJusticeIndex();

  const today    = new Date().toISOString().slice(0, 10);
  const dailyKey = getDailyCase(allCases, schedule, today);
  const dailyCases = [allCases[dailyKey]].filter(Boolean);

  const stored = loadStoredState();
  let state: AppState;

  if (stored && stored.date === today) {
    state = { ...stored, cases: dailyCases };
    if (state.phase === 'revealed') {
      // Always re-fetch so returning players see live vote counts
      state = { ...state, voteCounts: await fetchVoteCounts(dailyKey) };
      saveState(state);
    }
  } else {
    state = {
      date:           today,
      caseKeys:       [dailyKey],
      cases:          dailyCases,
      currentIndex:   0,
      justiceGuesses: [{}],
      playerVote:     [null],
      phase:          'playing',
      score:          0,
      voteCounts:     null,
    };
  }

  render(state);
  setupTooltipListeners();

  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'justice-guess') {
      state = handleJusticeGuess(state, btn.dataset.justice ?? '', btn.dataset.side as Guess);
      saveState(state);
      render(state);
      return;
    }

    if (action === 'player-vote') {
      state = handlePlayerVote(state, btn.dataset.side as Guess);
      saveState(state);
      render(state);
      return;
    }

    if (action === 'submit') {
      const c      = state.cases[state.currentIndex];
      const jg     = state.justiceGuesses[state.currentIndex] ?? {};
      const winner = c.winner as 'first' | 'second' | null;
      const votes  = (c.decisions[0]?.votes ?? []).filter(v => v.vote?.toLowerCase() !== 'none');

      let correct = 0;
      let total   = 0;
      for (const v of votes) {
        const name   = v.name ?? '';
        const guess  = jg[name];
        const actual = winner ? justiceVoteSide(v.vote ?? '', winner) : null;
        if (guess && actual) { total++; if (guess === actual) correct++; }
      }

      if (total > 0 && correct > total / 2) spawnConfetti();
      updateStreak(state.date);

      state = { ...state, phase: 'revealed', score: correct, voteCounts: null };
      saveState(state);
      render(state);

      // Post to API in background
      const docket     = state.caseKeys[state.currentIndex];
      const playerVote = state.playerVote[state.currentIndex];
      const elapsed_ms = Date.now() - loadTime;
      postGuess(state.date, docket, playerVote, correct, total, elapsed_ms).then(voteCounts => {
        state = { ...state, voteCounts };
        saveState(state);
        render(state);
      });
    }
  });
}

init();
