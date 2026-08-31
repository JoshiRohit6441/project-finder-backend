import os
from dotenv import load_dotenv

load_dotenv()


def get_env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


MONGO_URI = get_env("MONGO_URI", "mongodb://mongodb:27017/projectfinder")
REDIS_URL = get_env("REDIS_URL", "redis://redis:6379")
GOOGLE_PLACES_API_KEY = get_env("GOOGLE_PLACES_API_KEY", "")
JOB_STREAM = "stream:jobs"
EVENT_STREAM = "stream:events"
SCRAPER_GROUP = "scrapers"
CONSUMER_NAME = f"scraper-{os.getpid()}"
LOCK_PREFIX = "lock:job:"
