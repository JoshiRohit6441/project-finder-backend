from datetime import datetime, timezone
from ..db import find_job, update_job, inc_job, inc_campaign, lead_exists
from ..queue import publish_event
from ..scrapers.places import build_query, search_places
from ..scrapers.normalize import normalize_place
from ..scrapers.emails import extract_email_from_website

CITY_HINTS = {
    "AE": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
    "IN": ["Mumbai", "Delhi", "Bangalore", "Pune"],
    "US": ["New York", "Los Angeles", "Chicago", "Houston"],
    "GB": ["London", "Manchester", "Birmingham"],
}


def utcnow():
    return datetime.now(timezone.utc)


def search_locations(job):
    location = (job.get("location") or "").strip()
    if location:
        return [location]
    code = str(job.get("countryCode") or "").upper()
    cities = CITY_HINTS.get(code)
    if cities:
        return cities
    country = (job.get("country") or "").strip()
    return [country] if country else [""]


def passes_filters(lead, filters):
    filters = filters or {}
    if lead["rating"] < float(filters.get("minRating") or 0):
        return False
    if lead["reviewCount"] < int(filters.get("minReviews") or 0):
        return False
    if filters.get("excludeWithWebsite") and lead["hasWebsite"]:
        return False
    if filters.get("requirePhone") and not lead["phone"]:
        return False
    if not lead.get("email"):
        return False
    return True


def process_scrape_job(job_id):
    job = find_job(job_id)
    if not job:
        return
    if job.get("status") in {"cancelled", "paused", "completed"}:
        return

    update_job(job_id, {"status": "running", "startedAt": job.get("startedAt") or utcnow(), "error": ""})
    categories = job.get("categories") or ["business"]
    locations = search_locations(job)
    query_index = int(job.get("queryIndex") or 0)
    page_token = job.get("pageToken") or ""
    country = job.get("country") or ""
    filters = job.get("filters") or {}
    target = int(job.get("targetCount") or 0)
    limit = int(job.get("maxScrapeLimit") or 0)
    published = int(job.get("discoveredCount") or 0)
    max_queries = max(len(categories) * len(locations) * 4, 8)
    seen = set()

    while published < target and published < limit:
        job = find_job(job_id)
        if not job or job.get("status") in {"cancelled", "paused"}:
            return
        category = categories[query_index % len(categories)]
        location = locations[(query_index // max(len(categories), 1)) % len(locations)]
        query = build_query(category, location, country)
        places, next_token = search_places(query, page_token)
        if not places:
            query_index += 1
            page_token = ""
            if query_index >= max_queries:
                break
            update_job(job_id, {"queryIndex": query_index, "pageToken": ""})
            continue

        for place in places:
            job = find_job(job_id)
            if not job or job.get("status") in {"cancelled", "paused"}:
                return
            if published >= target or published >= limit:
                break
            lead = normalize_place(place, {**job, "location": location})
            if not lead["businessName"]:
                continue
            if not lead.get("email") and lead.get("website"):
                lead["email"] = extract_email_from_website(lead["website"])
            fingerprint = lead.get("fingerprint") or ""
            if fingerprint in seen or lead_exists(fingerprint):
                inc_job(job_id, {"duplicateCount": 1})
                inc_campaign(job["campaignId"], {"stats.duplicates": 1})
                continue
            if not passes_filters(lead, filters):
                inc_job(job_id, {"rejectedCount": 1})
                inc_campaign(job["campaignId"], {"stats.rejected": 1})
                continue
            seen.add(fingerprint)
            published += 1
            progress = min(100, int((published / max(target, 1)) * 100))
            update_job(job_id, {"progress": progress, "queryIndex": query_index, "pageToken": next_token})
            publish_event(
                "lead.candidate",
                {
                    "jobId": str(job["_id"]),
                    "campaignId": str(job["campaignId"]),
                    "lead": lead,
                },
            )

        if next_token:
            page_token = next_token
            update_job(job_id, {"pageToken": page_token})
        else:
            query_index += 1
            page_token = ""
            update_job(job_id, {"queryIndex": query_index, "pageToken": ""})
            if query_index >= max_queries:
                break

    final = find_job(job_id)
    if not final or final.get("status") in {"cancelled", "paused"}:
        return
    update_job(
        job_id,
        {
            "status": "completed",
            "progress": 100,
            "completedAt": utcnow(),
            "pageToken": page_token,
            "queryIndex": query_index,
        },
    )
    publish_event("job.completed", {"jobId": str(job_id)})
