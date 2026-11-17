import datetime as dt
import json
import os
import urllib.request
from pathlib import Path

phrases = ["Снежная королева " + suffix for suffix in (
    "интернет магазин", "купить", "пуховик", "шуба", "дубленки"
)]
today = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).date()
last_month = today.replace(day=1) - dt.timedelta(days=1)
folder = os.environ["WORDSTAT_FOLDER_ID"]
key = os.environ["WORDSTAT_API_KEY"]
if not folder or not key:
    raise SystemExit("Configure WORDSTAT_FOLDER_ID and WORDSTAT_API_KEY.")

def fetch(phrase, period, start, end):
    body = dict(phrase=phrase, period="PERIOD_" + period, regions=["225"],
                folderId=folder, fromDate=f"{start}T00:00:00Z", toDate=f"{end}T00:00:00Z")
    request = urllib.request.Request(
        "https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics",
        json.dumps(body).encode(),
        {"Authorization": "Api-Key " + key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return {row["date"][:10]: int(row["count"])
                for row in json.load(response).get("results", [])}

path = Path("data.json")
old = json.loads(path.read_text()) if path.exists() else {}
data = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(), "series": [], "daily_match": "quoted"}
for phrase in phrases:
    monthly = fetch(phrase, "MONTHLY", dt.date(2025, 1, 1), last_month)
    if not monthly:
        raise SystemExit(f"No monthly data returned for {phrase}.")
    previous = next((s for s in old.get("series", []) if s["phrase"] == phrase), {})
    daily = previous.get("daily", {}) if old.get("daily_match") == "quoted" else {}
    try:
        daily.update(fetch(f'"{phrase}"', "DAILY", today - dt.timedelta(days=59), today - dt.timedelta(days=1)))
    except urllib.error.HTTPError as error:
        print(f"Daily request for {phrase}: HTTP {error.code}. Preserving saved dates.")
    data["series"].append(dict(phrase=phrase, monthly=monthly, daily=daily))
path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
