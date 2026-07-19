import datetime
import json
import os
import pathlib
import urllib.error
import urllib.request

version = os.environ["VERSION"]
file_url = os.environ["FILE_URL"]
file_name = os.environ["FILE_NAME"]
sha256 = os.environ["SHA256"]
vt_url = f"https://www.virustotal.com/gui/file/{sha256}"
now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
api_key = os.environ.get("VIRUSTOTAL_API_KEY", "").strip()

stats = None
malicious = suspicious = undetected = harmless = timeout = failure = 0
engines_total = 0
flagged = []

if api_key:
    req = urllib.request.Request(
        f"https://www.virustotal.com/api/v3/files/{sha256}",
        headers={"x-apikey": api_key, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
        attrs = payload.get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats") or {}
        malicious = int(stats.get("malicious") or 0)
        suspicious = int(stats.get("suspicious") or 0)
        undetected = int(stats.get("undetected") or 0)
        harmless = int(stats.get("harmless") or 0)
        timeout = int(stats.get("timeout") or 0)
        failure = int(stats.get("failure") or 0)
        engines_total = malicious + suspicious + undetected + harmless + timeout + failure
        results = attrs.get("last_analysis_results") or {}
        for engine, row in results.items():
            cat = (row or {}).get("category")
            if cat in ("malicious", "suspicious"):
                flagged.append(f"{engine}: {(row or {}).get('result') or cat}")
        flagged.sort()
    except urllib.error.HTTPError as exc:
        if exc.code not in (404, 429):
            raise

data = {
    "version": version,
    "file": file_name,
    "url": file_url,
    "sha256": sha256,
    "virustotal": vt_url,
    "scannedAt": now,
    "stats": stats,
    "flagged": flagged[:20],
}
pathlib.Path("virustotal.json").write_text(
    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

if stats is None:
    summary_line = "Отчёт ещё обрабатывается VirusTotal."
else:
    dirty = malicious + suspicious
    summary_line = (
        f"**{dirty}/{engines_total}** движков пометили файл "
        f"(malicious: {malicious}, suspicious: {suspicious}; "
        f"clean/undetected: {undetected + harmless})."
    )

summary_path = pathlib.Path(os.environ["GITHUB_STEP_SUMMARY"])
with summary_path.open("a", encoding="utf-8") as fh:
    fh.write(f"### VirusTotal - v{version}\n\n")
    fh.write(f"{summary_line}\n\n")
    fh.write(f"- **Отчёт:** {vt_url}\n")
    fh.write(f"- **Файл:** `{file_name}`\n")
    fh.write(f"- **SHA256:** `{sha256}`\n")
    if flagged:
        fh.write("\n**Срабатывания:**\n\n")
        for item in flagged[:15]:
            fh.write(f"- `{item}`\n")

print(vt_url)
print(summary_line)
