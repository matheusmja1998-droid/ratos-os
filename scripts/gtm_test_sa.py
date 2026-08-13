import json, requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SA_JSON = "/Users/matheusjardim/claude/Ratos OS/winvision/clientes/ev-cosmeticos/rock-hangar-495111-h2-c0cfc4b355fb.json"
SCOPES = [
    "https://www.googleapis.com/auth/tagmanager.edit.containers",
    "https://www.googleapis.com/auth/tagmanager.publish",
    "https://www.googleapis.com/auth/tagmanager.readonly",
]
creds = service_account.Credentials.from_service_account_file(SA_JSON, scopes=SCOPES)
creds.refresh(Request())
H = {"Authorization": f"Bearer {creds.token}"}
BASE = "https://www.googleapis.com/tagmanager/v2"

r = requests.get(f"{BASE}/accounts", headers=H)
for a in r.json().get("account", []):
    print("CONTA:", a["accountId"], a["name"])
    rc = requests.get(f"{BASE}/accounts/{a['accountId']}/containers", headers=H)
    for c in rc.json().get("container", []):
        print("  container:", c["publicId"], c["name"])
        rw = requests.get(f"{BASE}/{c['path']}/workspaces", headers=H)
        for w in rw.json().get("workspace", []):
            print("    workspace:", w["workspaceId"], w["name"])
            rt = requests.get(f"{BASE}/{w['path']}/tags", headers=H)
            tags = rt.json().get("tag", [])
            print(f"    tags existentes: {len(tags)}")
            for t in tags[:10]:
                print("      -", t["name"], f"({t['type']})")
