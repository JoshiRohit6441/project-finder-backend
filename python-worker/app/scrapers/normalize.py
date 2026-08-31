import hashlib
import re


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


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
    website = clean(place.get("websiteUri") or "")
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
    return {
        "businessName": name,
        "category": category,
        "country": job.get("country") or "",
        "countryCode": job.get("countryCode") or "",
        "location": job.get("location") or "",
        "address": address,
        "rating": rating,
        "reviewCount": reviews,
        "hasWebsite": bool(website),
        "website": website,
        "email": "",
        "phone": phone,
        "sourceUrl": maps_url,
        "sourcePlaceId": place_id,
        "socials": {},
        "metadata": {"types": types},
        "fingerprint": fingerprint(name, job.get("countryCode") or job.get("country"), place_id, phone, website),
    }
