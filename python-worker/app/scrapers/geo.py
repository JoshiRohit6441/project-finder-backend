from math import atan2, cos, radians, sin, sqrt

CITY_COORDS = {
    "noida": (28.5355, 77.3910),
    "delhi": (28.6139, 77.2090),
    "new delhi": (28.6139, 77.2090),
    "gurgaon": (28.4595, 77.0266),
    "gurugram": (28.4595, 77.0266),
    "mumbai": (19.0760, 72.8777),
    "pune": (18.5204, 73.8567),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
    "hyderabad": (17.3850, 78.4867),
    "chennai": (13.0827, 80.2707),
    "kolkata": (22.5726, 88.3639),
    "ahmedabad": (23.0225, 72.5714),
    "jaipur": (26.9124, 75.7873),
    "lucknow": (26.8467, 80.9462),
    "new york": (40.7128, -74.0060),
    "los angeles": (34.0522, -118.2437),
    "london": (51.5074, -0.1278),
    "dubai": (25.2048, 55.2708),
}


def city_center(location, country=""):
    text = f"{location or ''} {country or ''}".lower()
    for name, coords in CITY_COORDS.items():
        if name in text:
            return coords
    return None


def haversine_km(lat1, lng1, lat2, lng2):
    dlat = radians(float(lat2) - float(lat1))
    dlng = radians(float(lng2) - float(lng1))
    a = sin(dlat / 2) ** 2 + cos(radians(float(lat1))) * cos(radians(float(lat2))) * sin(dlng / 2) ** 2
    return 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))


def nearby_cells(location, country=""):
    center = city_center(location, country)
    if not center:
        return []
    lat, lng = center
    step = 0.035
    cells = []
    for dlat in (-step, 0, step):
        for dlng in (-step, 0, step):
            cells.append((lat + dlat, lng + dlng))
    return cells


def location_restriction(location, country):
    center = city_center(location, country)
    if not center:
        return None
    lat, lng = center
    return {
        "rectangle": {
            "low": {"latitude": lat - 0.12, "longitude": lng - 0.14},
            "high": {"latitude": lat + 0.12, "longitude": lng + 0.14},
        }
    }
