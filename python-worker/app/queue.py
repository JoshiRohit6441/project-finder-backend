import json
import time
from redis import Redis
from .config import REDIS_URL, JOB_STREAM, EVENT_STREAM, SCRAPER_GROUP, CONSUMER_NAME, LOCK_PREFIX

_redis = None


def get_redis():
    global _redis
    if _redis is None:
        _redis = Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis


def ensure_group():
    redis = get_redis()
    try:
        redis.xgroup_create(JOB_STREAM, SCRAPER_GROUP, id="0", mkstream=True)
    except Exception as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def parse_fields(fields):
    payload = {}
    for key, value in fields.items():
        try:
            payload[key] = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            payload[key] = value
    return payload


def _entries_to_messages(entries):
    messages = []
    for message_id, fields in entries or []:
        messages.append({"id": message_id, "payload": parse_fields(fields)})
    return messages


def claim_pending(count=5, min_idle_ms=5000):
    redis = get_redis()
    result = redis.xautoclaim(
        name=JOB_STREAM,
        groupname=SCRAPER_GROUP,
        consumername=CONSUMER_NAME,
        min_idle_time=min_idle_ms,
        start_id="0-0",
        count=count,
    )
    entries = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else []
    return _entries_to_messages(entries)


def read_jobs(count=1, block_ms=5000):
    pending = claim_pending(count)
    if pending:
        return pending
    redis = get_redis()
    result = redis.xreadgroup(
        groupname=SCRAPER_GROUP,
        consumername=CONSUMER_NAME,
        streams={JOB_STREAM: ">"},
        count=count,
        block=block_ms,
    )
    if not result:
        return []
    messages = []
    for _, entries in result:
        messages.extend(_entries_to_messages(entries))
    return messages


def ack_job(message_id):
    get_redis().xack(JOB_STREAM, SCRAPER_GROUP, message_id)


def publish_event(event_type, data):
    get_redis().xadd(EVENT_STREAM, {"type": event_type, "data": json.dumps(data)})


def publish_job(job_type, data):
    get_redis().xadd(JOB_STREAM, {"type": job_type, "data": json.dumps(data)})


def publish_live(event, data=None):
    get_redis().publish("live:events", json.dumps({"event": event, "data": data or {}}))


def acquire_lock(job_id, ttl=600):
    return bool(get_redis().set(f"{LOCK_PREFIX}{job_id}", "1", nx=True, ex=ttl))


def release_lock(job_id):
    get_redis().delete(f"{LOCK_PREFIX}{job_id}")


def sleep(seconds):
    time.sleep(seconds)
