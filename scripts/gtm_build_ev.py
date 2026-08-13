"""Monta a infra de tracking da EV nos containers GTM web e server. NÃO publica."""
import json, time, requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SA_JSON = "/Users/matheusjardim/claude/Ratos OS/winvision/clientes/ev-cosmeticos/rock-hangar-495111-h2-c0cfc4b355fb.json"
SCOPES = [
    "https://www.googleapis.com/auth/tagmanager.edit.containers",
    "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
    "https://www.googleapis.com/auth/tagmanager.readonly",
]
ENV = {}
for line in open("/Users/matheusjardim/claude/Ratos OS/.env"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k] = v.strip().strip('"')

PIXEL = ENV["EV_PIXEL_ID"]
TOKEN_FB = ENV["EV_CAPI_TOKEN"]
GA4 = ENV["EV_GA4_MEASUREMENT_ID"]
SERVER_URL_PLACEHOLDER = "https://t.evcosmeticos.com.br"  # PENDENTE: criar no Stape + DNS

creds = service_account.Credentials.from_service_account_file(SA_JSON, scopes=SCOPES)
creds.refresh(Request())
H = {"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"}
BASE = "https://www.googleapis.com/tagmanager/v2"
WEB = "accounts/6360425195/containers/255237508/workspaces/2"
SRV = "accounts/6360425195/containers/255238614/workspaces/2"

def post(path, body, label):
    r = requests.post(f"{BASE}/{path}", headers=H, json=body)
    ok = r.status_code == 200
    print(("OK  " if ok else "ERRO"), label, "" if ok else r.text[:400])
    time.sleep(4)
    return r.json() if ok else None

# ============ WEB ============
print("===== WEB (GTM-5NR8K7QC) =====")

var_url = post(f"{WEB}/variables", {
    "name": "const - URL GTM Server",
    "type": "c",
    "parameter": [{"key": "value", "type": "template", "value": SERVER_URL_PLACEHOLDER}],
}, "variável const URL server")

post(f"{WEB}/tags", {
    "name": "Google Tag - GA4 via Server",
    "type": "googtag",
    "parameter": [
        {"key": "tagId", "type": "template", "value": GA4},
        {"key": "configSettingsTable", "type": "list", "list": [
            {"type": "map", "map": [
                {"key": "parameter", "type": "template", "value": "server_container_url"},
                {"key": "parameterValue", "type": "template", "value": "{{const - URL GTM Server}}"},
            ]},
            {"type": "map", "map": [
                {"key": "parameter", "type": "template", "value": "first_party_collection"},
                {"key": "parameterValue", "type": "template", "value": "true"},
            ]},
        ]},
    ],
    "firingTriggerId": ["2147479573"],  # Initialization - All Pages
}, "Google Tag GA4 → server")

META_BASE_HTML = """<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '%s');
fbq('track', 'PageView');
</script>""" % PIXEL

post(f"{WEB}/tags", {
    "name": "Meta Pixel - Base (PageView)",
    "type": "html",
    "parameter": [
        {"key": "html", "type": "template", "value": META_BASE_HTML},
        {"key": "supportDocumentWrite", "type": "boolean", "value": "false"},
    ],
    "firingTriggerId": ["2147479553"],  # All Pages
}, "Meta Pixel base browser")

# ============ SERVER ============
print("===== SERVER (GTM-WKXR5364) =====")

r = requests.get(f"{BASE}/{SRV}/clients", headers=H)
clients = r.json().get("client", []) if r.status_code == 200 else []
print("clients existentes:", [(c.get("name"), c.get("type")) for c in clients])
time.sleep(4)
if not any(c.get("type") == "gaaw_client" for c in clients):
    post(f"{SRV}/clients", {
        "name": "GA4",
        "type": "gaaw_client",
        "parameter": [
            {"key": "activateGtagSupport", "type": "boolean", "value": "true"},
            {"key": "activateDefaultPaths", "type": "boolean", "value": "true"},
            {"key": "cookieManagement", "type": "template", "value": "js"},
        ],
    }, "client GA4")

tpl_raw = open("/tmp/stape_fb_template.tpl").read()
tpl = post(f"{SRV}/templates", {
    "name": "Facebook Conversions API (Stape)",
    "templateData": tpl_raw,
}, "template Stape FB CAPI")
tpl_id = tpl["templateId"] if tpl else None
print("templateId:", tpl_id)

trg_all = post(f"{SRV}/triggers", {
    "name": "Todos os eventos GA4",
    "type": "customEvent",
    "customEventFilter": [{
        "type": "matchRegex",
        "parameter": [
            {"key": "arg0", "type": "template", "value": "{{_event}}"},
            {"key": "arg1", "type": "template", "value": ".*"},
        ],
    }],
}, "trigger todos eventos")

trg_ecom = post(f"{SRV}/triggers", {
    "name": "Ecommerce (sem purchase)",
    "type": "customEvent",
    "customEventFilter": [{
        "type": "matchRegex",
        "parameter": [
            {"key": "arg0", "type": "template", "value": "{{_event}}"},
            {"key": "arg1", "type": "template", "value": "^(page_view|view_item|add_to_cart|view_cart|begin_checkout)$"},
        ],
    }],
}, "trigger ecommerce sem purchase")

if trg_all:
    post(f"{SRV}/tags", {
        "name": "GA4 - Forward",
        "type": "sgtmgaaw",
        "parameter": [],
        "firingTriggerId": [trg_all["triggerId"]],
    }, "tag GA4 forward")

if tpl_id and trg_ecom:
    post(f"{SRV}/tags", {
        "name": "Meta CAPI - Ecommerce",
        "type": f"cvt_255238614_{tpl_id}",
        "parameter": [
            {"key": "inheritEventName", "type": "template", "value": "inherit"},
            {"key": "actionSource", "type": "template", "value": "website"},
            {"key": "pixelId", "type": "template", "value": PIXEL},
            {"key": "accessToken", "type": "template", "value": TOKEN_FB},
            {"key": "generateFbp", "type": "boolean", "value": "true"},
            {"key": "enableEventEnhancement", "type": "boolean", "value": "true"},
            {"key": "autoMapServerEventData", "type": "boolean", "value": "true"},
            {"key": "autoMapUserData", "type": "boolean", "value": "true"},
            {"key": "autoMapAppData", "type": "boolean", "value": "true"},
            {"key": "autoMapCustomData", "type": "boolean", "value": "true"},
            {"key": "adStorageConsent", "type": "template", "value": "optional"},
            {"key": "logType", "type": "template", "value": "debug"},
            {"key": "bigQueryLogType", "type": "template", "value": "no"},
        ],
        "firingTriggerId": [trg_ecom["triggerId"]],
    }, "tag Meta CAPI")

print("===== FIM (nada publicado) =====")
