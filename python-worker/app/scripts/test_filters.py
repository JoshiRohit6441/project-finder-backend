from app.scrapers.normalize import classify_website, normalize_place
from app.scrapers.chains import is_chain
from app.processors.filters import passes_filters, filter_reason


def ok(name, cond):
    print(("ok    " if cond else "FAIL  ") + name)
    return 0 if cond else 1


failed = 0
failed += ok("facebook is social not website", classify_website("https://www.facebook.com/templegym") == "social")
failed += ok("justdial is directory", classify_website("https://www.justdial.com/noida/gym") == "directory")
failed += ok("own domain is website", classify_website("https://templefitness.in") == "website")
failed += ok("empty is none", classify_website("") == "none")
failed += ok("google business.site is not a real website", classify_website("https://templegym.business.site") == "directory")
failed += ok("cult fit is a chain", is_chain("Cult Fit Sector 62"))
failed += ok("temple gym is not a chain", not is_chain("Temple fitness gym"))

place = {
    "displayName": {"text": "Temple fitness gym"},
    "websiteUri": "https://www.facebook.com/templegym",
    "internationalPhoneNumber": "+91 98765 43210",
    "rating": 5,
    "userRatingCount": 69,
    "formattedAddress": "Sector 62, Noida, Uttar Pradesh",
    "id": "places/abc",
}
lead = normalize_place(place, {"country": "India", "countryCode": "IN", "location": "Noida, Uttar Pradesh", "categories": ["gym"]})
failed += ok("facebook listing hasWebsite false", lead["hasWebsite"] is False)
failed += ok("facebook stored as social", lead["socials"].get("facebook"))
failed += ok(
    "no-site gym with phone passes quality filters",
    passes_filters(lead, {"minRating": 4, "minReviews": 5}),
)
failed += ok(
    "no-site gym without phone still passes scrape",
    passes_filters({**lead, "phone": ""}, {"minRating": 4, "minReviews": 5}),
)
failed += ok(
    "real website no longer excluded",
    passes_filters({**lead, "hasWebsite": True, "website": "https://gym.com"}, {"minRating": 4, "minReviews": 5}),
)
failed += ok(
    "ghaziabad address dropped for noida job",
    not passes_filters({**lead, "address": "Indirapuram, Ghaziabad, Uttar Pradesh"}, {"minRating": 4, "minReviews": 5}),
)
failed += ok("chain reason", filter_reason({**lead, "businessName": "Anytime Fitness Noida"}, {"minRating": 4, "minReviews": 5}) == "chain")
failed += ok("closed reason", filter_reason({**lead, "businessStatus": "CLOSED_PERMANENTLY"}, {"minRating": 4, "minReviews": 5}) == "closed")
failed += ok("low rating reason", filter_reason({**lead, "rating": 2}, {"minRating": 4, "minReviews": 5}) == "low_rating")

if failed:
    raise SystemExit(f"{failed} failed")
print("\nall scrape filter tests passed")
