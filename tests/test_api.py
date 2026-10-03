"""Smoke-test every AgriRisk API route against a running server."""

import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
failures = []


def call(path, method="GET", body=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            return response.status, json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}


def check(label, path, method="GET", body=None, expect_keys=()):
    status, payload = call(path, method, body)
    ok = status == 200
    missing = [k for k in expect_keys if k not in payload]
    if not ok:
        failures.append(f"{label}: HTTP {status} -> {json.dumps(payload, ensure_ascii=False)[:220]}")
    elif missing:
        failures.append(f"{label}: missing keys {missing}")
    size = len(json.dumps(payload))
    print(f"{'PASS' if ok and not missing else 'FAIL'}  {label:<26} {status}  {size:>7}B")
    return payload


health = check("health", "/api/health", expect_keys=("status", "llm_configured", "dam_coverage"))
print("      llm_configured:", health.get("llm_configured"),
      "| dam through:", (health.get("dam_coverage") or {}).get("last_date"))

ref = check("reference", "/api/reference", expect_keys=("governorates", "crops", "periods"))
print("      governorates:", len(ref.get("governorates", [])),
      "| crops:", len(ref.get("crops", [])))

assess = check("assessment", "/api/assessment?governorate=Kairouan&crop=Tomato",
               expect_keys=("governorate", "risk", "rainfall", "water", "crop_exposure"))
print("      risk:", (assess.get("risk") or {}).get("level_code"),
      "| precip:", (assess.get("rainfall") or {}).get("precipitation_mm"),
      "| dam:", (assess.get("water") or {}).get("dam_fill_rate_pct"),
      "| crop:", (assess.get("crop_exposure") or {}).get("exposure_level"))

national = check("national", "/api/national", expect_keys=("points", "summary", "coverage"))
print("      points:", len(national.get("points", [])),
      "| risk_counts:", (national.get("summary") or {}).get("risk_counts"),
      "| mean fill:", (national.get("summary") or {}).get("mean_dam_fill_pct"),
      "| failures:", len(national.get("failures", [])))

check("map", "/api/map", expect_keys=("points",))
climate = check("climate", "/api/climate", expect_keys=("rows",))
print("      rows:", len(climate.get("rows", [])),
      "| sample:", json.dumps((climate.get("rows") or [{}])[0], ensure_ascii=False)[:150])

check("water", "/api/water?governorate=Kairouan", expect_keys=("dam_fill_rate_pct",))
summary = check("water/summary", "/api/water/summary", expect_keys=("rows", "date"))
print("      date:", summary.get("date"), "| dams:", len(summary.get("rows", [])))

hist = check("water/history", "/api/water/history?limit=24", expect_keys=("series",))
print("      months:", len(hist.get("series", [])), "| last:", json.dumps(
    (hist.get("series") or [{}])[-1], ensure_ascii=False)[:170])

dam_name = (summary.get("rows") or [{}])[0].get("dam")
if dam_name:
    quote = urllib.parse.quote(str(dam_name))
    check("dam history", f"/api/water/dams/{quote}/history?limit=12", expect_keys=("series",))

check("crops", "/api/crops", expect_keys=("crops",))
exposure = check("crops/exposure", "/api/crops/exposure?governorate=Kairouan", expect_keys=("rows",))
print("      ranking:", json.dumps((exposure.get("rows") or [])[:2], ensure_ascii=False)[:190])

scen = check("scenario", "/api/scenario", "POST",
             {"governorate": "Kairouan", "rainfall_change_pct": -25, "crop": "Tomato"},
             expect_keys=("risk_before", "risk_after", "scenario"))
print("      before:", (scen.get("risk_before") or {}).get("level_code"),
      "-> after:", (scen.get("risk_after") or {}).get("level_code"))

rep = check("reports", "/api/reports?governorate=Kairouan&crop=Tomato", expect_keys=("reports",))
print("      reports:", [r.get("id") for r in rep.get("reports", [])])

chat = call("/api/chat", "POST", {"message": "What is the dam status in Kairouan?",
                                  "governorate": "Kairouan"})
if chat[0] == 200:
    print(f"PASS  chat                     200  reply={len(chat[1].get('reply',''))} chars "
          f"tools={chat[1].get('tools_used')}")
elif chat[0] == 502 and "Missing API key" in json.dumps(chat[1]):
    print("SKIP  chat                     no GROQ_API_KEY configured (expected)")
else:
    failures.append(f"chat: HTTP {chat[0]} -> {json.dumps(chat[1], ensure_ascii=False)[:220]}")
    print(f"FAIL  chat                     {chat[0]}")

status, _ = call("/api/assessment?governorate=Atlantis")
print(("PASS" if status == 400 else "FAIL") + "  bad governorate -> 400")
if status != 400:
    failures.append(f"bad governorate returned {status}")

print()
if failures:
    print(f"{len(failures)} FAILURE(S):")
    for line in failures:
        print("  -", line)
    sys.exit(1)
print("ALL API CHECKS PASSED")