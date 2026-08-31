import traceback
from datetime import datetime, timezone
from .config import CONSUMER_NAME
from .db import get_db, update_job
from .queue import ack_job, acquire_lock, ensure_group, publish_job, read_jobs, release_lock, sleep
from .processors.scrape_job import process_scrape_job


def requeue_stuck_jobs():
    jobs = get_db()["scrapejobs"].find({"status": "queued"})
    for job in jobs:
        publish_job("scrape", {"jobId": str(job["_id"]), "campaignId": str(job.get("campaignId") or "")})


def handle_message(message):
    payload = message.get("payload") or {}
    data = payload.get("data") or {}
    job_type = payload.get("type")
    job_id = data.get("jobId")
    if job_type != "scrape" or not job_id:
        return
    if not acquire_lock(job_id):
        return
    try:
        process_scrape_job(job_id)
    except Exception as exc:
        update_job(
            job_id,
            {
                "status": "failed",
                "error": str(exc),
                "completedAt": datetime.now(timezone.utc),
            },
        )
        traceback.print_exc()
    finally:
        release_lock(job_id)


def run():
    ensure_group()
    requeue_stuck_jobs()
    print(f"python worker started {CONSUMER_NAME}")
    while True:
        try:
            messages = read_jobs()
            if not messages:
                continue
            for message in messages:
                handle_message(message)
                ack_job(message["id"])
        except Exception:
            traceback.print_exc()
            sleep(2)


if __name__ == "__main__":
    run()
