from pymongo import MongoClient, ReturnDocument
from bson import ObjectId
from .config import MONGO_URI

_client = None


def get_db():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    db = _client.get_default_database()
    if db is None:
        return _client["projectfinder"]
    return db


def to_id(value):
    return ObjectId(value) if not isinstance(value, ObjectId) else value


def find_job(job_id):
    return get_db()["scrapejobs"].find_one({"_id": to_id(job_id)})


def update_job(job_id, updates):
    result = get_db()["scrapejobs"].find_one_and_update(
        {"_id": to_id(job_id)},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    from .queue import publish_live
    publish_live("jobs", {"jobId": str(job_id)})
    return result


def inc_job(job_id, fields):
    result = get_db()["scrapejobs"].find_one_and_update(
        {"_id": to_id(job_id)},
        {"$inc": fields},
        return_document=ReturnDocument.AFTER,
    )
    from .queue import publish_live
    publish_live("jobs", {"jobId": str(job_id)})
    return result


def inc_campaign(campaign_id, fields):
    get_db()["campaigns"].update_one({"_id": to_id(campaign_id)}, {"$inc": fields})


def lead_exists(fingerprint):
    return get_db()["leads"].find_one({"fingerprint": fingerprint}, {"_id": 1})


def insert_lead(doc):
    result = get_db()["leads"].insert_one(doc)
    from .queue import publish_live
    publish_live("leads", {"leadId": str(result.inserted_id)})
    publish_live("jobs", {"jobId": str(doc.get("jobId") or "")})
    return result
