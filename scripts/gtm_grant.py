import json, requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

creds = Credentials.from_authorized_user_file("/Users/matheusjardim/claude/Ratos OS/gtm-oauth-token.json")
if not creds.valid:
    creds.refresh(Request())
H = {"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"}
BASE = "https://www.googleapis.com/tagmanager/v2"

ACCOUNT = "6360425195"  # Ev cosméticos
body = {
    "emailAddress": "claude-gtm@rock-hangar-495111-h2.iam.gserviceaccount.com",
    "accountAccess": {"permission": "user"},
    "containerAccess": [{"containerId": "255237508", "permission": "publish"}],
}
r = requests.post(f"{BASE}/accounts/{ACCOUNT}/user_permissions", headers=H, json=body)
print(r.status_code)
print(json.dumps(r.json(), indent=2)[:500])
