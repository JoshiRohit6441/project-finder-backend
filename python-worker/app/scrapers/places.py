import time
import httpx
from ..config import GOOGLE_PLACES_API_KEY
from ..queue import get_redis

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
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
        "nextPageToken",
    ]
)


def build_query(category, location, country):
    where = location or country
    return f"{category} in {where}".strip()


def places_api_key():
    try:
        stored = get_redis().get("settings:googlePlacesKey")
        if stored:
            return stored
    except Exception:
        pass
    return GOOGLE_PLACES_API_KEY


def search_places(query, page_token=""):
    api_key = places_api_key()
    if not api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY is not configured")
    body = {"textQuery": query, "pageSize": 20}
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
