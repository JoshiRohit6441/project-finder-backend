import hashlib
import re
from urllib.parse import urlparse


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


SOCIAL_HOSTS = (
    "facebook.com",
    "fb.com",
    "fb.me",
    "instagram.com",
    "youtube.com",
    "youtu.be",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "linkedin.com",
    "wa.me",
    "whatsapp.com",
    "t.me",
    "pinterest.com",
)

DIRECTORY_HOSTS = (
    "justdial.com",
    "sulekha.com",
    "indiamart.com",
    "magicpin.in",
    "zomato.com",
    "swiggy.com",
    "tripadvisor.",
    "yelp.com",
    "yellowpages",
    "hotfrog",
    "asklaila",
    "nearify",
    "grotal.com",
    "sulekha",
    "bookmyshow.com",
    "healthgrades.com",
    "practo.com",
    "lybrate.com",
    "business.site",
    "sites.google.com",
    "maps.app.goo.gl",
    "goo.gl",
    "linktr.ee",
    "biolink",
)


def host_of(url):
    raw = clean(url)
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.netloc or "").lower().lstrip("www.")


def classify_website(url):
    host = host_of(url)
    if not host:
        return "none"
    if any(host == item or host.endswith("." + item) or item in host for item in SOCIAL_HOSTS):
        return "social"
    if any(item in host for item in DIRECTORY_HOSTS):
        return "directory"
    return "website"


def social_name(url):
    host = host_of(url)
    mapping = (
        ("instagram", "instagram"),
        ("facebook", "facebook"),
        ("fb.com", "facebook"),
        ("linkedin", "linkedin"),
        ("youtube", "youtube"),
        ("youtu.be", "youtube"),
        ("tiktok", "tiktok"),
        ("twitter", "x"),
        ("x.com", "x"),
        ("wa.me", "whatsapp"),
        ("whatsapp", "whatsapp"),
    )
    for needle, name in mapping:
        if needle in host:
            return name
    return ""


def fingerprint(name, country, place_id="", phone="", website=""):
    base = "|".join(
        [
            clean(name).lower(),
            clean(country).lower(),
            clean(place_id) or clean(phone) or clean(website).lower(),
        ]
    )
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def normalize_place(place, job):
    display = place.get("displayName") or {}
    name = clean(display.get("text") or place.get("name") or "")
    raw_website = clean(place.get("websiteUri") or "")
    kind = classify_website(raw_website)
    website = raw_website if kind == "website" else ""
    socials = {}
    if kind == "social":
        key = social_name(raw_website)
        if key:
            socials[key] = raw_website
    phone = clean(place.get("internationalPhoneNumber") or place.get("nationalPhoneNumber") or "")
    address = clean(place.get("formattedAddress") or "")
    rating = float(place.get("rating") or 0)
    reviews = int(place.get("userRatingCount") or 0)
    types = place.get("types") or []
    category = clean(job.get("categories", [""])[0] if job.get("categories") else "")
    if types:
        category = clean(types[0].replace("_", " "))
    maps_url = clean(place.get("googleMapsUri") or "")
    place_id = clean(place.get("id") or place.get("name") or "")
    loc = place.get("location") or {}
    return {
        "businessName": name,
        "category": category,
        "country": job.get("country") or "",
        "countryCode": job.get("countryCode") or "",
        "location": job.get("location") or "",
        "address": address,
        "rating": rating,
        "reviewCount": reviews,
        "hasWebsite": kind == "website",
        "website": website,
        "websiteKind": kind,
        "email": "",
        "phone": phone,
        "sourceUrl": maps_url,
        "sourcePlaceId": place_id,
        "socials": socials,
        "businessStatus": clean(place.get("businessStatus") or ""),
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "metadata": {
            "types": types,
            "websiteKind": kind,
            "rawWebsiteUri": raw_website,
            "businessStatus": clean(place.get("businessStatus") or ""),
        },
        "fingerprint": fingerprint(name, job.get("countryCode") or job.get("country"), place_id, phone, website or raw_website),
    }
