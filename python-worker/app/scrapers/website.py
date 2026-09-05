import httpx
from .normalize import classify_website

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"


def prove_website(url):
    raw = str(url or "").strip()
    kind = classify_website(raw)
    if kind != "website":
        return {"ok": False, "kind": kind or "none", "url": ""}
    href = raw if "://" in raw else f"https://{raw}"
    try:
        with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True, verify=False, timeout=10) as client:
            response = client.get(href)
            if response.status_code >= 400:
                return {"ok": False, "kind": "dead", "url": ""}
            final = str(response.url or href)
            final_kind = classify_website(final)
            if final_kind != "website":
                return {"ok": False, "kind": final_kind, "url": final}
            return {"ok": True, "kind": "website", "url": final}
    except Exception:
        return {"ok": False, "kind": "dead", "url": ""}
