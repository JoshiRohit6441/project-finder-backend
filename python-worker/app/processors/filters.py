from ..scrapers.chains import is_chain
from ..scrapers.geo import city_center, haversine_km


def has_phone(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return len(digits) >= 8


def has_email(value):
    text = str(value or "").strip()
    return "@" in text and "." in text.split("@")[-1] and not any(ch in text for ch in "*#[]{}<>")


def address_matches_location(address, location):
    city = str(location or "").split(",")[0].strip().lower()
    if len(city) < 3:
        return True
    addr = str(address or "").lower()
    if not addr:
        return True
    return city in addr


def within_city(lead, max_km=16):
    center = city_center(lead.get("location"), lead.get("country"))
    lat, lng = lead.get("lat"), lead.get("lng")
    if center and lat is not None and lng is not None:
        try:
            return haversine_km(lat, lng, center[0], center[1]) <= max_km
        except (TypeError, ValueError):
            return True
    return address_matches_location(lead.get("address"), lead.get("location"))


def filter_reason(lead, filters=None):
    filters = filters or {}
    if not lead.get("businessName"):
        return "no_name"
    if lead.get("businessStatus") in {"CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"}:
        return "closed"
    if lead.get("rating", 0) < float(filters.get("minRating") or 0):
        return "low_rating"
    if lead.get("reviewCount", 0) < int(filters.get("minReviews") or 0):
        return "low_reviews"
    if not within_city(lead):
        return "wrong_city"
    if is_chain(lead.get("businessName")):
        return "chain"
    return ""


def passes_filters(lead, filters):
    return not filter_reason(lead, filters)
