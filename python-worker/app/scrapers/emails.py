import re
from html import unescape
from urllib.parse import urljoin, urlparse, unquote
import httpx

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
COMPLETE_EMAIL_RE = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.I)
MASK_CHARS = set("*#[]{}<>")
MAILTO_RE = re.compile(r"mailto:([^\"'\s?>]+)", re.I)
OBFUSCATED_RE = re.compile(
    r"([A-Z0-9._%+\-]{2,})\s*(?:\[at\]|\(at\)|\s+at\s+)\s*([A-Z0-9.\-]+\.[A-Z]{2,})",
    re.I,
)
CF_EMAIL_RE = re.compile(r"data-cfemail=[\"']([0-9a-f]+)[\"']", re.I)
CONTACT_HREF_RE = re.compile(
    r"""href=["']([^"']*(?:contact|reserv|enquiry|inquiry|get-in-touch|book-now|connect)[^"']*)["']""",
    re.I,
)
SKIP_PARTS = (
    "noreply",
    "no-reply",
    "donotreply",
    "privacy",
    "legal@",
    "wixpress",
    "sentry.io",
    "example.com",
    "domain.com",
    "email.com",
    "yourdomain",
    "placeholder",
    "test.com",
    "schema.org",
    "w3.org",
    "googleapis",
    "gstatic",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
)
CONTACT_PATHS = (
    "",
    "/contact",
    "/contact-us",
    "/contactus",
    "/about",
    "/about-us",
    "/reservations",
    "/reservation",
    "/booking",
    "/en/contact",
    "/en/contact-us",
    "/ar/contact",
)


def is_useful_email(value):
    email = str(value or "").strip().lower()
    if not email or email.count("@") != 1:
        return False
    if any(char in email for char in MASK_CHARS):
        return False
    if not COMPLETE_EMAIL_RE.fullmatch(email):
        return False
    local, domain = email.split("@", 1)
    if not local or "." not in domain or ".." in email:
        return False
    if local.startswith(".") or local.endswith("."):
        return False
    return not any(part in email for part in SKIP_PARTS)


def decode_cfemail(hex_value):
    try:
        key = int(hex_value[:2], 16)
        chars = [chr(int(hex_value[i : i + 2], 16) ^ key) for i in range(2, len(hex_value), 2)]
        return "".join(chars)
    except (ValueError, TypeError):
        return ""


def emails_from_html(html):
    text = unescape(html or "")
    found = []

    def add(email):
        email = unquote(str(email or "")).strip().strip(".,;:()[]<>").lower()
        if is_useful_email(email) and email not in found:
            found.append(email)

    for match in MAILTO_RE.findall(text):
        add(match.split("?")[0])
    for match in CF_EMAIL_RE.findall(text):
        add(decode_cfemail(match))
    for local, domain in OBFUSCATED_RE.findall(text):
        add(f"{local}@{domain}")
    for match in EMAIL_RE.findall(text):
        add(match)
    return found


def fetch_page(client, url):
    try:
        response = client.get(url, timeout=15, follow_redirects=True)
        if response.status_code >= 400:
            return ""
        return response.text or ""
    except httpx.HTTPError:
        return ""


def extra_contact_urls(base, html):
    urls = []
    for href in CONTACT_HREF_RE.findall(html or ""):
        url = urljoin(base + "/", href)
        if url.startswith(base) and url not in urls:
            urls.append(url)
        if len(urls) >= 4:
            break
    return urls


def extract_email_from_website(website):
    if not website:
        return ""
    parsed = urlparse(website if "://" in website else f"https://{website}")
    if not parsed.netloc:
        return ""
    base = f"{parsed.scheme or 'https'}://{parsed.netloc}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
    }
    seen = set()
    with httpx.Client(headers=headers, verify=False, follow_redirects=True) as client:
        homepage = fetch_page(client, base)
        pages = [urljoin(base + "/", path.lstrip("/")) for path in CONTACT_PATHS]
        pages.extend(extra_contact_urls(base, homepage))
        for url in pages:
            if url in seen:
                continue
            seen.add(url)
            html = homepage if url.rstrip("/") == base.rstrip("/") else fetch_page(client, url)
            emails = emails_from_html(html)
            if emails:
                return emails[0]
    return ""
