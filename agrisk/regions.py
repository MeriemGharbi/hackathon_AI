"""Tunisian agricultural regions / governorates covered by AgriRisk."""

import unicodedata

# Complete coverage of major Tunisian agricultural and regional hubs
TUNISIA_REGIONS = {
    "Kairouan": [35.6781, 10.0963],
    "Béja": [36.7256, 9.1817],
    "Jendouba": [36.5011, 8.7803],
    "Siliana": [36.0849, 9.3708],
    "Nabeul": [36.4561, 10.7376],
    "Bizerte": [37.2744, 9.8739],
    "Sfax": [34.7406, 10.7603],
    "Tunis": [36.8065, 10.1815],
    "Le Kef": [36.1742, 8.7049],
    "Médenine": [33.3549, 10.5055],
    "Zaghouan": [36.4029, 10.1429],
    "Manouba": [36.8083, 10.1037],
    "Ariana": [36.8665, 10.193],
    "Ben Arous": [36.7531, 10.2282],
    "Sousse": [35.8256, 10.6369],
    "Monastir": [35.7779, 10.8261],
    "Mahdia": [35.5047, 11.0622],
    "Kasserine": [35.1677, 8.8365],
    "Sidi Bouzid": [35.0382, 9.4857],
    "Gafsa": [34.425, 8.7842],
    "Gabès": [33.8815, 10.0982],
    "Tozeur": [33.9197, 8.1335],
    "Kébili": [33.7046, 8.969],
    "Tataouine": [32.9297, 10.4518],
}


def region_names():
  """Sorted list of selectable governorates."""
  return sorted(TUNISIA_REGIONS.keys())


def resolve_region(name):
  """Fuzzy-resolve a user/model supplied governorate to a known region name.

  Returns the canonical name, or None when it cannot be matched.
  """
  if not isinstance(name, str) or not name.strip():
    return None
  cleaned = name.strip()
  if cleaned in TUNISIA_REGIONS:
    return cleaned

  def _key(text):
    folded = unicodedata.normalize("NFKD", text).lower()
    return "".join(c for c in folded if not unicodedata.combining(c))

  target = _key(cleaned)
  for known in TUNISIA_REGIONS:
    if _key(known) == target:
      return known
  for known in TUNISIA_REGIONS:
    if target and (target in _key(known) or _key(known) in target):
      return known
  return None
