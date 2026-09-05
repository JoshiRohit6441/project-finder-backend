from datetime import datetime, timezone
from ..db import find_job, update_job, inc_job, inc_campaign, lead_exists
from ..queue import publish_event
from ..scrapers.places import build_query, search_places, search_nearby, get_place_details
from ..scrapers.geo import nearby_cells
from ..scrapers.normalize import normalize_place
from ..scrapers.emails import extract_email_from_website
from ..scrapers.website import prove_website
from .filters import filter_reason

CITY_HINTS = {
    "AE": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
    "IN": ["Mumbai", "Delhi", "Noida", "Bangalore", "Pune"],
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


def reject(job_id, campaign_id, reason):
    inc_job(job_id, {"rejectedCount": 1, f"rejectReasons.{reason}": 1})
    inc_campaign(campaign_id, {"stats.rejected": 1, f"stats.rejectReasons.{reason}": 1})


def duplicate(job_id, campaign_id):
    inc_job(job_id, {"duplicateCount": 1})
    inc_campaign(campaign_id, {"stats.duplicates": 1})


def enrich_place(place, cache):
    place_id = place.get("id") or place.get("name") or ""
    if place_id in cache:
        return cache[place_id]
    details = get_place_details(place_id)
    merged = {**(details or {}), **place} if not details else {**place, **details}
    cache[place_id] = merged
    return merged


def build_lead(place, job, location, outreach_mode, cache):
    detailed = enrich_place(place, cache)
    lead = normalize_place(detailed, {**job, "location": location})
    lead["outreachMode"] = outreach_mode
    if lead.get("website"):
        proof = prove_website(lead["website"])
        lead["metadata"] = {**(lead.get("metadata") or {}), "websiteProof": proof}
        if proof.get("ok"):
            lead["website"] = proof.get("url") or lead["website"]
            lead["hasWebsite"] = True
        else:
            lead["hasWebsite"] = False
            lead["website"] = ""
            if proof.get("kind") == "social" and proof.get("url"):
                lead.setdefault("socials", {})
    if not lead.get("email") and lead.get("website"):
        lead["email"] = extract_email_from_website(lead["website"])
    return lead


def publish_lead(job, lead, seen, seen_ids, seen_phones):
    fingerprint = lead.get("fingerprint") or ""
    place_id = lead.get("sourcePlaceId") or ""
    phone = lead.get("phone") or ""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if place_id and place_id in seen_ids:
        duplicate(job["_id"], job["campaignId"])
        return False
    if digits and digits in seen_phones:
        duplicate(job["_id"], job["campaignId"])
        return False
    if fingerprint in seen or lead_exists(fingerprint, place_id, phone):
        duplicate(job["_id"], job["campaignId"])
        return False
    reason = filter_reason(lead, job.get("filters") or {})
    if reason:
        reject(job["_id"], job["campaignId"], reason)
        return False
    seen.add(fingerprint)
    if place_id:
        seen_ids.add(place_id)
    if digits:
        seen_phones.add(digits)
    publish_event(
        "lead.candidate",
        {
            "jobId": str(job["_id"]),
            "campaignId": str(job["campaignId"]),
            "lead": lead,
        },
    )
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
    nearby_index = int(job.get("nearbyIndex") or 0)
    country = job.get("country") or ""
    filters = job.get("filters") or {}
    outreach_mode = job.get("outreachMode") or filters.get("outreachMode") or "email"
    target = int(job.get("targetCount") or 0)
    limit = int(job.get("maxScrapeLimit") or 0)
    published = int(job.get("discoveredCount") or 0)
    max_queries = max(len(categories) * len(locations) * 4, 8)
    seen = set()
    seen_ids = set()
    seen_phones = set()
    cache = {}

    while published < target and published < limit and query_index < max_queries:
        job = find_job(job_id)
        if not job or job.get("status") in {"cancelled", "paused"}:
            return
        category = categories[query_index % len(categories)]
        location = locations[(query_index // max(len(categories), 1)) % len(locations)]
        query = build_query(category, location, country)
        places, next_token = search_places(
            query, page_token, location=location, country=country, category=category
        )
        if not places:
            query_index += 1
            page_token = ""
            update_job(job_id, {"queryIndex": query_index, "pageToken": ""})
            continue

        for place in places:
            job = find_job(job_id)
            if not job or job.get("status") in {"cancelled", "paused"}:
                return
            if published >= target or published >= limit:
                break
            lead = build_lead(place, {**job, "location": location}, location, outreach_mode, cache)
            if publish_lead(job, lead, seen, seen_ids, seen_phones):
                published += 1
                progress = min(100, int((published / max(target, 1)) * 100))
                update_job(job_id, {"progress": progress, "queryIndex": query_index, "pageToken": next_token})

        if next_token:
            page_token = next_token
            update_job(job_id, {"pageToken": page_token})
        else:
            query_index += 1
            page_token = ""
            update_job(job_id, {"queryIndex": query_index, "pageToken": ""})

    nearby_tasks = []
    for location in locations:
        for category in categories:
            for lat, lng in nearby_cells(location, country):
                nearby_tasks.append((location, category, lat, lng))

    while published < target and published < limit and nearby_index < len(nearby_tasks):
        job = find_job(job_id)
        if not job or job.get("status") in {"cancelled", "paused"}:
            return
        location, category, lat, lng = nearby_tasks[nearby_index]
        places = search_nearby(lat, lng, category=category)
        for place in places:
            job = find_job(job_id)
            if not job or job.get("status") in {"cancelled", "paused"}:
                return
            if published >= target or published >= limit:
                break
            lead = build_lead(place, {**job, "location": location}, location, outreach_mode, cache)
            if publish_lead(job, lead, seen, seen_ids, seen_phones):
                published += 1
                progress = min(100, int((published / max(target, 1)) * 100))
                update_job(job_id, {"progress": progress, "nearbyIndex": nearby_index})
        nearby_index += 1
        update_job(job_id, {"nearbyIndex": nearby_index})

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
            "nearbyIndex": nearby_index,
        },
    )
    publish_event("job.completed", {"jobId": str(job_id)})
