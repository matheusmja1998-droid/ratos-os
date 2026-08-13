import json, requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

creds = Credentials.from_authorized_user_file("/Users/matheusjardim/claude/Ratos OS/gtm-oauth-token.json")
if not creds.valid:
    creds.refresh(Request())
H = {"Authorization": f"Bearer {creds.token}"}
BASE = "https://www.googleapis.com/tagmanager/v2"

r = requests.get(f"{BASE}/accounts", headers=H)
r.raise_for_status()
accounts = r.json().get("account", [])
for a in accounts:
    print("CONTA:", a["accountId"], a["name"])
    rc = requests.get(f"{BASE}/accounts/{a['accountId']}/containers", headers=H)
    for c in rc.json().get("container", []):
        print("  container:", c["containerId"], c["publicId"], c["name"], c.get("usageContext"))
