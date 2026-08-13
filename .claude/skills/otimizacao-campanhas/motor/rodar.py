"""
Pipeline completo: coleta -> diagnostica -> envia Telegram.
Uso: rodar.py <cliente> [--dry]
"""
import sys, subprocess
from pathlib import Path

base = Path(__file__).resolve().parent
slug = sys.argv[1] if len(sys.argv) > 1 else "fernanda"
dry = "--dry" in sys.argv

py = sys.executable

for script in ["coletar.py", "diagnosticar.py", "tendencias.py", "checker_aprovacao.py"]:
    r = subprocess.run([py, str(base / script), slug], capture_output=True, text=True)
    print(r.stdout)
    if r.returncode != 0:
        print(r.stderr); sys.exit(1)

args = [py, str(base / "reportar.py"), slug]
if dry: args.append("--dry")
r = subprocess.run(args, capture_output=True, text=True)
print(r.stdout)
if r.returncode != 0:
    print(r.stderr); sys.exit(1)
