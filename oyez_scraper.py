import json
import os
import re
import time
from typing import Optional
import requests

OYEZ_API_BASE = "https://api.oyez.org/cases"
SCHEDULE_PATH = "public/schedule.json"
OUTPUT_PATH = "public/cases.json"
IMAGES_DIR = "public/assets/images"

# Manual overrides for cases where the Oyez API doesn't provide winning_party.
# Keys are the full Oyez path (year/id) as they appear in schedule.json.
WINNER_OVERRIDES: dict = {
    "1973/73-1766":      "first",   # United States v. Nixon — US (first party) won
    "2021/19-1392":      "first",   # Dobbs v. JWHO — Dobbs/Mississippi (first party) won
    "1940-1955/316us535": "first",  # Skinner v. Oklahoma — Skinner (first party) won
    "2004/04-108":        "second", # Kelo v. New London — New London (second party) won
    # Bare-docket overrides (keyed by docket number as it appears in schedule.json)
    "07-290":  "second", # D.C. v. Heller — Heller (second/respondent) won
    "08-205":  "first",  # Citizens United v. FEC — Citizens United (first/petitioner) won
    "12-307":  "second", # United States v. Windsor — Windsor (second/respondent) won
    "19-1392": "first",  # Dobbs v. Jackson Women's Health — Dobbs/Mississippi (first) won
    "20-843":  "first",  # NYSRPA v. Bruen — NYSRPA (first/petitioner) won
    "20-1199": "first",  # SFFA v. Harvard — SFFA (first/petitioner) won
}


def resolve_docket(docket: str) -> Optional[tuple[str, str]]:
    """Resolve a bare docket number (e.g. '00-949') to (year, case_id) by probing
    the Oyez API. The two-digit prefix indicates the filing term; cases can be heard
    up to ~4 terms later, so we try a range of years. We verify the returned
    docket_number matches to avoid the API returning a wrong default case."""
    prefix_match = re.match(r"^(\d{2})-", docket)
    if not prefix_match:
        print(f"  ERROR unexpected docket format: {docket!r}")
        return None
    yy = int(prefix_match.group(1))
    base_year = 2000 + yy
    for year in range(base_year, base_year + 5):
        url = f"{OYEZ_API_BASE}/{year}/{docket}"
        resp = requests.get(url, headers={"Accept": "application/json"})
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                data = data[0] if data else None
            # Verify the docket number matches to avoid false positives
            if data and data.get("docket_number") == docket:
                return str(year), docket
        time.sleep(0.2)
    print(f"  ERROR could not resolve docket {docket!r} (tried {base_year}–{base_year+4})")
    return None


def fetch_case(year: str, case_id: str) -> Optional[dict]:
    url = f"{OYEZ_API_BASE}/{year}/{case_id}"
    response = requests.get(url, headers={"Accept": "application/json"})
    if response.status_code != 200:
        print(f"  ERROR {response.status_code} for {url}")
        return None
    data = response.json()
    # Some old cases return a list; take the first element
    if isinstance(data, list):
        if not data:
            print(f"  ERROR empty list for {url}")
            return None
        data = data[0]
    return data


def justice_filename(name: str, mime: Optional[str]) -> str:
    ext = ".png"
    if mime and "/" in mime:
        ext = "." + mime.split("/")[-1]
    safe = re.sub(r"[^\w\s-]", "", name).strip().lower()
    safe = re.sub(r"[\s]+", "_", safe)
    return f"{safe}{ext}"


def download_image(name: str, href: str, mime: Optional[str]) -> Optional[str]:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    filename = justice_filename(name, mime)
    path = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(path):
        return path
    response = requests.get(href)
    if response.status_code != 200:
        print(f"    IMAGE ERROR {response.status_code} for {href}")
        return None
    with open(path, "wb") as f:
        f.write(response.content)
    print(f"    Downloaded image: {filename}")
    return path


def significant_words(s: str) -> set:
    stopwords = {"the", "of", "and", "or", "in", "for", "et", "al", "v", "vs",
                 "board", "state", "states", "united", "director", "department"}
    return {w.lower() for w in re.split(r"\W+", s) if len(w) > 2 and w.lower() not in stopwords}


def determine_winner(winning_party: Optional[str], first_party: Optional[str],
                     second_party: Optional[str]) -> Optional[str]:
    if not winning_party:
        return None
    wp = significant_words(winning_party)
    fp = significant_words(first_party or "")
    sp = significant_words(second_party or "")
    fp_score = len(wp & fp)
    sp_score = len(wp & sp)
    if fp_score == 0 and sp_score == 0:
        return None
    if fp_score > sp_score:
        return "first"
    if sp_score > fp_score:
        return "second"
    # Tie: try full substring match
    wp_str = winning_party.lower()
    if (first_party or "").lower() in wp_str or wp_str in (first_party or "").lower():
        return "first"
    if (second_party or "").lower() in wp_str or wp_str in (second_party or "").lower():
        return "second"
    return None


def parse_votes(raw_decision: dict) -> list:
    votes = []
    for v in raw_decision.get("votes") or []:
        member = v.get("member") or {}
        thumbnail = member.get("thumbnail") or {}
        href = thumbnail.get("href")
        mime = thumbnail.get("mime")
        name = member.get("name")
        if name and href:
            download_image(name, href, mime)
        votes.append({"name": name, "vote": v.get("vote")})
    return votes


def extract_decisions(raw_decisions: Optional[list],
                      first_party: Optional[str],
                      second_party: Optional[str],
                      winner_hint: Optional[str] = None) -> list:
    """Parse all Oyez decision objects and return a single-element list containing
    the most relevant one (the main substantive holding).

    Oyez stores each legal question as a separate decision with its own vote tally.
    We pick the decision that:
      1. Has a winning_party matching winner_hint (if provided), else any known winner
      2. Has the most contested vote split (5-4 beats 9-0)
    """
    if not raw_decisions:
        return []

    candidates = []
    for d in raw_decisions:
        votes = parse_votes(d)
        wp = d.get("winning_party")
        winner = determine_winner(wp, first_party, second_party) if wp else None
        majority_count = sum(
            1 for v in votes
            if (v.get("vote") or "").lower()
            in ("majority", "plurality", "concurrence", "special concurrence")
        )
        participating = len([v for v in votes if v.get("vote") and v["vote"].lower() != "none"])
        split = min(majority_count, participating - majority_count)
        candidates.append({
            "description": d.get("description"),
            "winning_party": wp,
            "votes": votes,
            "_winner": winner,
            "_split": split,
        })

    def rank_key(c: dict) -> tuple:
        winner_score = 0
        if c["_winner"] and winner_hint and c["_winner"] == winner_hint:
            winner_score = 2  # best: matches the known override
        elif c["_winner"]:
            winner_score = 1  # good: resolves to some winner
        return (winner_score, c["_split"])

    ranked = sorted(candidates, key=rank_key, reverse=True)
    best = ranked[0]
    return [{
        "description": best["description"],
        "winning_party": best["winning_party"],
        "votes": best["votes"],
    }]


def clean(s: Optional[str]) -> Optional[str]:
    """Remove Oyez HTML quirks from text fields."""
    if s is None:
        return None
    return s.replace("<i>certiorari</i>", "certiorari")


def parse_case(data: dict, winner_hint: Optional[str] = None) -> dict:
    first_party = data.get("first_party")
    second_party = data.get("second_party")
    decisions = extract_decisions(data.get("decisions"), first_party, second_party, winner_hint)

    winner = None
    for d in decisions:
        wp = d.get("winning_party")
        if wp:
            winner = determine_winner(wp, first_party, second_party)
            if winner:
                break

    oyez_url = (data.get("href") or "").replace("api.oyez.org", "www.oyez.org") or None

    return {
        "oyez_url": oyez_url,
        "first_party": first_party,
        "second_party": second_party,
        "first_party_label": data.get("first_party_label"),
        "second_party_label": data.get("second_party_label"),
        "name": data.get("name"),
        "docket_number": data.get("docket_number"),
        "manner_of_jurisdiction": clean(data.get("manner_of_jurisdiction")),
        "facts_of_the_case": clean(data.get("facts_of_the_case")),
        "question": clean(data.get("question")),
        "conclusion": clean(data.get("conclusion")),
        "winner": winner,
        "decisions": decisions,
    }


def load_schedule(schedule_path: str) -> list:
    """Returns list of (schedule_key, year_or_None, case_id_or_None) from schedule.json values.
    Bare docket numbers (no '/') are flagged for resolution at fetch time."""
    with open(schedule_path) as f:
        schedule = json.load(f)
    seen = set()
    entries = []
    for key in schedule.values():
        if key in seen:
            continue
        seen.add(key)
        if "/" in key:
            year, case_id = key.split("/", 1)
            entries.append((key, year, case_id))
        else:
            # Bare docket number — will be resolved via Oyez search
            entries.append((key, None, None))
    return entries


def main():
    os.makedirs("public", exist_ok=True)
    entries = load_schedule(SCHEDULE_PATH)
    print(f"Loaded {len(entries)} unique cases from {SCHEDULE_PATH}")

    results = {}
    for schedule_key, year, case_id in entries:
        if year is None:
            # Bare docket number — resolve to year/case_id first
            print(f"Resolving docket {schedule_key} ...")
            resolved = resolve_docket(schedule_key)
            if resolved is None:
                continue
            year, case_id = resolved
            print(f"  Resolved to {year}/{case_id}")
            time.sleep(0.3)

        print(f"Fetching {year}/{case_id} ...")
        data = fetch_case(year, case_id)
        if data is None:
            continue
        winner_hint = WINNER_OVERRIDES.get(schedule_key)
        parsed = parse_case(data, winner_hint)
        if winner_hint:
            parsed["winner"] = winner_hint
        results[schedule_key] = parsed
        print(f"  Saved: {parsed.get('name')} (winner: {parsed.get('winner')})")
        time.sleep(0.3)

    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDone. {len(results)} cases written to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
