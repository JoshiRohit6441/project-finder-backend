import time
import httpx
from ..config import GOOGLE_PLACES_API_KEY
from ..queue import get_redis
from .geo import location_restriction

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
PLACE_URL = "https://places.googleapis.com/v1"
FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.googleMapsUri",
        "places.types",
        "places.location",
        "places.businessStatus",
        "nextPageToken",
    ]
)

DETAIL_MASK = ",".join(
    [
        "id",
        "displayName",
        "formattedAddress",
        "rating",
        "userRatingCount",
        "websiteUri",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "googleMapsUri",
        "types",
        "location",
        "businessStatus",
    ]
)


INCLUDED_TYPES = {
    "gym": "gym",
    "fitness": "gym",
    "restaurant": "restaurant",
    "dental": "dentist",
    "dentist": "dentist",
    "hotel": "hotel",
    "salon": "beauty_salon",
    "lawyer": "lawyer",
    "clinic": "doctor",
}


def build_query(category, location, country):
    where = location or country
    return f"{category} in {where}".strip()


def included_type(category):
    key = str(category or "").lower()
    for needle, value in INCLUDED_TYPES.items():
        if needle in key:
            return value
    return ""


def place_resource(place_id):
    raw = str(place_id or "").strip()
    if raw.startswith("places/"):
        return raw
    if raw:
        return f"places/{raw}"
    return ""


def places_api_key():
    try:
        stored = get_redis().get("settings:googlePlacesKey")
        if stored:
            return stored
    except Exception:
        pass
    return GOOGLE_PLACES_API_KEY


def search_places(query, page_token="", location="", country="", category=""):
    api_key = places_api_key()
    if not api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY is not configured")
    body = {"textQuery": query, "pageSize": 20}
    restriction = location_restriction(location, country)
    if restriction:
        body["locationRestriction"] = restriction
    itype = included_type(category)
    if itype:
        body["includedType"] = itype
    if page_token:
        body["pageToken"] = page_token
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    last_error = None
    for attempt in range(4):
        try:
            response = httpx.post(SEARCH_URL, json=body, headers=headers, timeout=30)
            if response.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            data = response.json()
            return data.get("places") or [], data.get("nextPageToken") or ""
        except httpx.HTTPError as exc:
            last_error = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Places search failed: {last_error}")


def search_nearby(lat, lng, category="", radius=2500):
    api_key = places_api_key()
    if not api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY is not configured")
    itype = included_type(category)
    if not itype:
        return []
    body = {
        "includedTypes": [itype],
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": float(lat), "longitude": float(lng)},
                "radius": float(radius),
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    try:
        response = httpx.post(NEARBY_URL, json=body, headers=headers, timeout=30)
        if response.status_code >= 400:
            return []
        return (response.json() or {}).get("places") or []
    except httpx.HTTPError:
        return []


def get_place_details(place_id):
    resource = place_resource(place_id)
    api_key = places_api_key()
    if not resource or not api_key:
        return None
    headers = {"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": DETAIL_MASK}
    try:
        response = httpx.get(f"{PLACE_URL}/{resource}", headers=headers, timeout=20)
        if response.status_code >= 400:
            return None
        return response.json() or None
    except httpx.HTTPError:
        return None
