export interface Vote {
  name: string | null;
  vote: string | null;
}

export interface Decision {
  description: string | null;
  winning_party: string | null;
  votes: Vote[];
}

export interface CaseData {
  oyez_url: string | null;
  first_party: string | null;
  second_party: string | null;
  first_party_label: string | null;
  second_party_label: string | null;
  name: string | null;
  docket_number: string | null;
  manner_of_jurisdiction: string | null;
  facts_of_the_case: string | null;
  question: string | null;
  conclusion: string | null;
  winner: 'first' | 'second' | null;
  decisions: Decision[];
}

export type Guess = 'first' | 'second';
export type JusticeGuesses = Record<string, Guess>;

export interface JusticeTerm {
  role: string;
  start: string;
  end: string;
  appointed_by: string;
}

export interface JusticeInfo {
  term: string;
  appointed_by: string[];
  description: string;
  oyez_url: string;
  terms: JusticeTerm[];
}

export interface VoteCounts {
  first: number;
  second: number;
}

export interface AppState {
  date: string;
  caseKeys: string[];
  cases: CaseData[];
  currentIndex: number;
  justiceGuesses: JusticeGuesses[];
  playerVote: (Guess | null)[];
  phase: 'playing' | 'revealed';
  score: number;
  voteCounts: VoteCounts | null;
}
