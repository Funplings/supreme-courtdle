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
}


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


def extract_decisions(raw_decisions: Optional[list]) -> list:
    if not raw_decisions:
        return []
    decisions = []
    for d in raw_decisions:
        votes = []
        for v in d.get("votes") or []:
            member = v.get("member") or {}
            thumbnail = member.get("thumbnail") or {}
            href = thumbnail.get("href")
            mime = thumbnail.get("mime")
            name = member.get("name")
            if name and href:
                download_image(name, href, mime)
            votes.append({"name": name, "vote": v.get("vote")})
        decisions.append({
            "description": d.get("description"),
            "winning_party": d.get("winning_party"),
            "votes": votes,
        })
    return decisions


def clean(s: Optional[str]) -> Optional[str]:
    """Remove Oyez HTML quirks from text fields."""
    if s is None:
        return None
    return s.replace("<i>certiorari</i>", "certiorari")


def parse_case(data: dict) -> dict:
    first_party = data.get("first_party")
    second_party = data.get("second_party")
    decisions = extract_decisions(data.get("decisions"))

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
    """Returns list of (year, case_id, full_path) from schedule.json values."""
    with open(schedule_path) as f:
        schedule = json.load(f)
    seen = set()
    entries = []
    for path in schedule.values():
        if path in seen:
            continue
        seen.add(path)
        if "/" not in path:
            print(f"  SKIP malformed path (missing year): {path!r}")
            continue
        year, case_id = path.split("/", 1)
        entries.append((year, case_id, path))
    return entries


def main():
    os.makedirs("public", exist_ok=True)
    entries = load_schedule(SCHEDULE_PATH)
    print(f"Loaded {len(entries)} unique cases from {SCHEDULE_PATH}")

    results = {}
    for year, case_id, path in entries:
        print(f"Fetching {path} ...")
        data = fetch_case(year, case_id)
        if data is None:
            continue
        parsed = parse_case(data)
        if parsed.get("winner") is None and path in WINNER_OVERRIDES:
            parsed["winner"] = WINNER_OVERRIDES[path]
        results[path] = parsed
        print(f"  Saved: {parsed.get('name')} (winner: {parsed.get('winner')})")
        time.sleep(0.3)

    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDone. {len(results)} cases written to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
