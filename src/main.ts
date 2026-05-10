import './style.css';
import type { AppState, CaseData, Guess, JusticeInfo } from './types';
import { getDailyCase, updateStreak } from './game';

// ─── Justice data & name matching ────────────────────────────────────────────

let justiceData: Record<string, JusticeInfo> = {};
// Maps a normalized "lastname[+suffix]" key → justice name in justiceData
const justiceIndex = new Map<string, string>();

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

function nameKey(name: string): string {
  const words = name.replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
  // Collect any trailing roman-numeral/generational suffixes
  const suffixParts: string[] = [];
  let i = words.length - 1;
  while (i >= 0 && SUFFIXES.has(words[i].toLowerCase())) {
    suffixParts.unshift(words[i].toLowerCase());
    i--;
  }
  // Last remaining word is the last name
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

// ─── Legal term tooltips ─────────────────────────────────────────────────────

const LEGAL_TERMS: Record<string, string> = {
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
  'concurrence':        'An opinion agreeing with the majority\'s outcome but offering different or additional reasoning.',
};

// Build a single regex sorted longest-first so multi-word phrases take priority
const _termPattern = new RegExp(
  `\\b(${Object.keys(LEGAL_TERMS)
    .sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi',
);

function highlightTerms(html: string): string {
  // Split into HTML tags vs text nodes; only replace inside text nodes
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
    return raw ? (JSON.parse(raw) as StoredState) : null;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────


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
  const safe = name
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return `/assets/images/${safe}.png`;
}

function shortName(name: string): string {
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
  const words = name.replace(/[.,]/g, '').split(/\s+/);
  for (let i = words.length - 1; i >= 0; i--) {
    if (!suffixes.has(words[i].toLowerCase()) && words[i].length > 1) {
      return words[i];
    }
  }
  return words[words.length - 1];
}

const VOTE_STYLE: Record<string, { label: string; ring: string; badge: string }> = {
  'majority':            { label: 'Majority', ring: 'border-emerald-400', badge: 'bg-emerald-500' },
  'dissent':             { label: 'Dissent',  ring: 'border-rose-400',    badge: 'bg-rose-500'   },
  'concurrence':         { label: 'Concur',   ring: 'border-amber-400',   badge: 'bg-amber-400'  },
  'special concurrence': { label: 'Concur',   ring: 'border-amber-400',   badge: 'bg-amber-400'  },
  'plurality':           { label: 'Plurality',ring: 'border-sky-400',     badge: 'bg-sky-500'    },
};

function renderJustices(c: CaseData, showVotes: boolean): string {
  const votes = c.decisions[0]?.votes ?? [];
  if (!votes.length) return '';

  const PLACEHOLDER = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23e7e5e4'/><circle cx='50' cy='38' r='18' fill='%23a8a29e'/><ellipse cx='50' cy='84' rx='30' ry='22' fill='%23a8a29e'/></svg>`;

  const items = votes.map(v => {
    const name = v.name ?? 'Unknown';
    const src  = justiceImagePath(name);
    const voteKey = (v.vote ?? '').toLowerCase();
    const style   = VOTE_STYLE[voteKey];

    const ring = showVotes && style ? style.ring : 'border-stone-200';

    const badge = showVotes && style
      ? `<span class="absolute -bottom-1 left-1/2 -translate-x-1/2
                      text-[7px] font-semibold text-white px-1.5 py-px rounded-lg whitespace-nowrap
                      ${style.badge}">${style.label}</span>`
      : '';

    const info = findJustice(name);
    let tooltip = '';
    if (info) {
      const latestTerm = info.terms[0];
      const role = latestTerm?.role ?? 'Justice';
      const apptBy = latestTerm?.appointed_by ?? (info.appointed_by[0] ?? '');
      const start = latestTerm?.start ?? '';
      const end   = latestTerm?.end ?? 'present';
      tooltip = `<div class="justice-tooltip">
        <div style="font-weight:600;margin-bottom:3px">${role}</div>
        <div>Appointed by ${apptBy}</div>
        <div style="opacity:0.75;font-size:12px;margin-top:2px">${start}–${end}</div>
      </div>`;
    }

    return `
      <div class="flex flex-col items-center gap-1" style="width:5.5rem">
        <div class="relative justice-wrap cursor-help">
          ${tooltip}
          <img src="${src}" alt="${name}"
               class="w-16 h-16 rounded-lg object-cover border-2 ${ring} bg-stone-100"
               onerror="this.src='${PLACEHOLDER}'" />
          ${badge}
        </div>
        <span class="text-[10px] text-stone-500 text-center leading-tight">${name}</span>
      </div>`;
  }).join('');

  const label = showVotes ? 'The Vote' : 'The Court';
  return `
    <div class="mt-5 pt-4 border-t border-stone-100">
      <p class="text-xs uppercase tracking-widest text-stone-400 mb-3">${label}</p>
      <div class="flex flex-wrap justify-center gap-x-2 gap-y-3">${items}</div>
    </div>`;
}

const JURISDICTION_TOOLTIPS: Record<string, string> = {
  'Writ of certiorari':  'The Supreme Court chose to hear this case at its own discretion. At least four justices must agree to grant the petition.',
  'Appeal':              'A lower court\'s decision was challenged and the Supreme Court was obligated to hear it.',
  'Original jurisdiction': 'The case was filed directly in the Supreme Court without going through lower courts, typically for disputes between states.',
  'Other':               'The case reached the Supreme Court through an alternative procedural route.',
};

function renderCaseCard(c: CaseData, showVotes = false): string {
  const jurisdiction = c.manner_of_jurisdiction ?? '';
  const facts = highlightTerms(c.facts_of_the_case ?? '<em>No background available.</em>');
  const question = highlightTerms(c.question ?? '<em>No question available.</em>');

  const jTooltip = JURISDICTION_TOOLTIPS[jurisdiction];
  const jurisdictionValue = jTooltip
    ? `<span class="term-tip" data-def="${jTooltip.replace(/"/g, '&quot;')}">${jurisdiction}</span>`
    : jurisdiction;

  return `
    <div class="bg-white rounded-lg shadow-sm border border-stone-100 p-6 mb-4 fade-up">
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
      ${renderJustices(c, showVotes)}
    </div>
  `;
}

function renderPartyButtons(c: CaseData): string {
  const fp  = c.first_party  ?? 'First Party';
  const sp  = c.second_party ?? 'Second Party';
  const fpl = c.first_party_label  ?? 'Petitioner';
  const spl = c.second_party_label ?? 'Respondent';

  return `
    <p class="text-center text-xs uppercase tracking-widest text-stone-400 mb-3">Who prevailed?</p>
    <div class="grid grid-cols-2 gap-3 fade-up">
      <button data-action="guess" data-side="first"
        class="bg-navy text-white rounded-lg p-4 text-center
               hover:bg-navy/90 active:scale-[0.97] transition-all duration-150 cursor-pointer">
        <div class="text-xs uppercase tracking-wide opacity-60 mb-1">${fpl}</div>
        <div class="font-serif font-bold text-base leading-tight">${fp}</div>
      </button>
      <button data-action="guess" data-side="second"
        class="bg-navy text-white rounded-lg p-4 text-center
               hover:bg-navy/90 active:scale-[0.97] transition-all duration-150 cursor-pointer">
        <div class="text-xs uppercase tracking-wide opacity-60 mb-1">${spl}</div>
        <div class="font-serif font-bold text-base leading-tight">${sp}</div>
      </button>
    </div>
  `;
}

function renderRevealed(state: AppState): string {
  const c = state.cases[state.currentIndex];
  const guess = state.guesses[state.currentIndex];
  const correct = guess === c.winner;
  const winnerName = c.winner === 'first' ? c.first_party : c.second_party;
  const loserName  = c.winner === 'first' ? c.second_party : c.first_party;

  const resultClass = correct ? 'result-correct' : 'result-wrong';
  const icon     = correct ? '✓' : '✗';
  const headline = correct ? 'Correct!' : 'Not quite.';

  const conclusionHtml = c.conclusion
    ? `<div class="text-sm leading-relaxed case-content mt-3 pt-3 border-t border-current/20 opacity-80">${highlightTerms(c.conclusion)}</div>`
    : '';

  return `
    ${renderCaseCard(c, true)}
    <div class="rounded-lg border p-4 mb-4 fade-up ${resultClass}">
      <div class="flex items-center gap-2 mb-1">
        <span class="font-bold text-lg">${icon}</span>
        <span class="font-serif font-bold text-lg">${headline}</span>
      </div>
      <p class="text-sm">
        <strong>${winnerName}</strong> prevailed over <strong>${loserName}</strong>.
      </p>
      ${conclusionHtml}
    </div>
    ${c.oyez_url ? `
      <a href="${c.oyez_url}" target="_blank" rel="noopener noreferrer"
         class="flex items-center justify-center gap-1.5 text-xs text-stone-400 hover:text-navy transition-colors mt-2 fade-up">
        View full case on Oyez ↗
      </a>` : ''}
  `;
}


function render(state: AppState): void {
  const app = document.getElementById('app')!;
  const body =
    state.phase === 'revealed' ? renderRevealed(state) :
                                 renderCaseCard(state.cases[state.currentIndex]) +
                                 renderPartyButtons(state.cases[state.currentIndex]);

  app.innerHTML = `
    <div class="max-w-3xl mx-auto px-4 py-8 pb-4">
      <div class="text-right text-base text-navy mb-2">
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
}

// ─── Events ──────────────────────────────────────────────────────────────────

function handleGuess(state: AppState, side: Guess): AppState {
  const correct = side === state.cases[state.currentIndex].winner;
  const guesses = [...state.guesses];
  guesses[state.currentIndex] = side;
  updateStreak(state.date);
  return {
    ...state,
    guesses,
    score: correct ? state.score + 1 : state.score,
    phase: 'revealed',
  };
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

  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = getDailyCase(allCases, schedule, today);
  const dailyCases = [allCases[dailyKey]].filter(Boolean);

  const stored = loadStoredState();
  let state: AppState;

  if (stored && stored.date === today) {
    state = { ...stored, cases: dailyCases };
  } else {
    state = {
      date: today,
      caseKeys: [dailyKey],
      cases: dailyCases,
      currentIndex: 0,
      guesses: new Array<Guess | null>(dailyCases.length).fill(null),
      score: 0,
      phase: 'playing',
    };
  }

  render(state);

  // Event delegation on document
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'guess') {
      state = handleGuess(state, btn.dataset.side as Guess);
    }

    saveState(state);
    render(state);
  });
}

init();
