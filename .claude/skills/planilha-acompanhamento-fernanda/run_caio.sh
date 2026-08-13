#!/bin/bash
# Preenchimento diario da planilha de acompanhamento do CAIO (VISAO GERAL)
export AGENTE_ENV=/root/agente/.env
export SA_JSON=/root/agente/sa_caio_spend.json
cd /root/planilha-acompanhamento-caio
/root/agente/venv/bin/python3 preencher.py >> /root/agente/logs/planilha_caio.log 2>&1
