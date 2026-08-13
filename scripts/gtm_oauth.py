import os, json
from google_auth_oauthlib.flow import InstalledAppFlow

env = {}
with open("/Users/matheusjardim/claude/Ratos OS/.claude/skills/google-ads-ratos/.env") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"').strip("'")

SCOPES = [
    "https://www.googleapis.com/auth/tagmanager.manage.users",
    "https://www.googleapis.com/auth/tagmanager.edit.containers",
    "https://www.googleapis.com/auth/tagmanager.publish",
    "https://www.googleapis.com/auth/tagmanager.readonly",
]

flow = InstalledAppFlow.from_client_config(
    {"installed": {
        "client_id": env["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": env["GOOGLE_ADS_CLIENT_SECRET"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }},
    scopes=SCOPES,
)
creds = flow.run_local_server(port=8765, prompt="consent")
out = "/Users/matheusjardim/claude/Ratos OS/gtm-oauth-token.json"
with open(out, "w") as f:
    f.write(creds.to_json())
print("TOKEN_SALVO", out)
