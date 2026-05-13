"""
Import Aura Casa.xlsx into Firestore for a given organization.
Requires GOOGLE_APPLICATION_CREDENTIALS pointing to a Firebase service account JSON.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

import pandas as pd


def parse_money(val: Any) -> float:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("R$", "").replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def excel_serial_to_datetime(val: Any):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, datetime):
        return val
    try:
        # pandas may already parse excel dates
        ts = pd.to_datetime(val)
        if pd.isna(ts):
            return None
        dt = ts.to_pydatetime()
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except Exception:
        return None


def norm_id_part(s: str) -> str:
    out = re.sub(r"[^\w\-]", "_", s.strip())
    return out[:200] if out else "x"


def safe_int(val: Any, default: int = 0) -> int:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return default
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


def pick_col(row: pd.Series, *candidates: str) -> Any:
    """Primeira coluna cuja etiqueta coincide (após strip) com um dos nomes dados."""
    by_label = {str(c).strip(): c for c in row.index}
    for name in candidates:
        key = name.strip()
        col = by_label.get(key)
        if col is not None:
            return row[col]
    return None


def _letters_only_lower(s: str) -> str:
    nf = unicodedata.normalize("NFKD", s.strip())
    return "".join(c for c in nf if not unicodedata.combining(c)).lower()


def txt(row: pd.Series, *keys: str) -> str:
    v = pick_col(row, *keys)
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).strip()
    return "" if s.lower() == "nan" else s


def import_sheet_clients(org_ref: Any, xl: pd.ExcelFile) -> tuple[dict[str, str], dict[str, str], int]:
    """Lê folha Clientes e grava em organizations/{org}/clients."""
    client_code_to_id: dict[str, str] = {}
    client_name_to_id: dict[str, str] = {}
    if "Clientes" not in xl.sheet_names:
        return client_code_to_id, client_name_to_id, 0

    df_c = pd.read_excel(xl, "Clientes")
    df_c.columns = [str(c).strip() for c in df_c.columns]
    saved = 0
    for _, row in df_c.iterrows():
        code = txt(row, "Código", "Codigo")
        name = txt(row, "Nome")
        if not code and not name:
            continue
        if _letters_only_lower(code) == "codigo" and _letters_only_lower(name) == "nome":
            continue
        cid = norm_id_part(code or name)
        ref = org_ref.collection("clients").document(cid)
        display_name = name or code
        reg = excel_serial_to_datetime(pick_col(row, "Data Cadastro"))
        last = excel_serial_to_datetime(pick_col(row, "Ultima compra", "Última compra"))
        ref.set(
            {
                "code": code,
                "name": display_name,
                "phone": txt(row, "Telefone"),
                "city": txt(row, "Cidade"),
                "instagram": txt(row, "Intagram", "Instagram"),
                "registeredAt": reg,
                "lastPurchaseAt": last,
                "totalPurchased": parse_money(pick_col(row, "Total comprado")),
                "purchaseCount": safe_int(pick_col(row, "Quantidade")),
                "avgTicket": parse_money(pick_col(row, "Ticket Médio", "Ticket Medio")),
                "notes": txt(row, "Observações", "Observacoes"),
            },
            merge=True,
        )
        if code:
            client_code_to_id[code] = ref.id
        client_name_to_id[display_name] = ref.id
        saved += 1

    return client_code_to_id, client_name_to_id, saved


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--excel", required=True, help="Path to Aura Casa.xlsx")
    parser.add_argument("--org-id", required=True, dest="org_id")
    parser.add_argument(
        "--credentials",
        dest="credentials",
        help="Caminho ao JSON da conta de serviço (alternativa a GOOGLE_APPLICATION_CREDENTIALS)",
    )
    parser.add_argument(
        "--clients-only",
        action="store_true",
        help="Importar apenas a folha Clientes para o Firestore.",
    )
    args = parser.parse_args()

    cred_path = args.credentials or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path:
        cred = credentials.Certificate(cred_path)
    else:
        print(
            "Indique --credentials CAMINHO\\serviceAccount.json ou defina a variável GOOGLE_APPLICATION_CREDENTIALS.",
            file=sys.stderr,
        )
        return 1

    firebase_admin.initialize_app(cred)
    db = firestore.client()

    org_ref = db.collection("organizations").document(args.org_id)

    xl = pd.ExcelFile(args.excel)

    client_code_to_id: dict[str, str] = {}
    client_name_to_id: dict[str, str] = {}
    product_key_to_id: dict[str, str] = {}

    if args.clients_only:
        _, _, n = import_sheet_clients(org_ref, xl)
        print(f"Clientes: {n} linhas gravadas/atualizadas em organizations/{args.org_id}/clients")
        return 0

    # --- Config ---
    if "Config" in xl.sheet_names:
        df_cfg = pd.read_excel(xl, "Config", header=None)
        lists = {
            "paymentMethods": [],
            "saleStatuses": [],
            "sizes": [],
            "financialCategories": [],
            "suppliers": [],
            "months": [],
        }
        cols_map = [
            ("paymentMethods", 0),
            ("saleStatuses", 1),
            ("sizes", 3),
            ("financialCategories", 6),
            ("suppliers", 9),
            ("months", 11),
        ]
        for key, col_idx in cols_map:
            if col_idx >= df_cfg.shape[1]:
                continue
            series = df_cfg.iloc[1:, col_idx].dropna()
            lists[key] = [str(x).strip() for x in series if str(x).strip()]
        org_ref.collection("meta").document("settings").set(lists, merge=True)

    # --- Clientes ---
    client_code_to_id, client_name_to_id, _ = import_sheet_clients(org_ref, xl)

    # --- Produtos ---
    if "Produtos" in xl.sheet_names:
        df_p = pd.read_excel(xl, "Produtos")
        df_p.columns = [str(c).strip() for c in df_p.columns]
        for _, row in df_p.iterrows():
            code = str(row.get("Código", "") or "").strip()
            size = str(row.get("Tamanho", "") or "").strip()
            name = str(row.get("Produto", "") or "").strip()
            pid = norm_id_part(f"{code}_{size}")
            ref = org_ref.collection("products").document(pid)
            cost = parse_money(row.get("Custo"))
            freight = parse_money(row.get("Frete"))
            ipi = parse_money(row.get("IPI"))
            packaging = parse_money(row.get("Embalagem"))
            total_cost = parse_money(row.get("Custo Total")) or cost + freight + ipi + packaging
            ref.set(
                {
                    "code": code,
                    "name": name or code,
                    "size": size,
                    "category": "" if pd.isna(row.get("Categoria")) else str(row.get("Categoria")),
                    "cost": cost,
                    "freight": freight,
                    "ipi": ipi,
                    "packaging": packaging,
                    "totalCost": total_cost,
                    "marginPct": float(row.get("Margem %") or 0),
                    "suggestedPrice": parse_money(row.get("Preço sugerido")),
                    "minPrice": parse_money(row.get("Preço minimo")),
                    "fee3x": float(row.get("Taxa 3x") or 0),
                    "price3x": parse_money(row.get("3x sem juros")),
                    "fee12x": float(row.get("Taxa 12x") or 0),
                    "price12x": parse_money(row.get("12x sem juros")),
                    "stock": int(row.get("Estoque Atual") or 0),
                },
                merge=True,
            )
            product_key_to_id[f"{code}|{size}"] = ref.id

    # --- Entradas ---
    if "Entradas" in xl.sheet_names:
        df_e = pd.read_excel(xl, "Entradas")
        df_e.columns = [str(c).strip() for c in df_e.columns]
        for _, row in df_e.iterrows():
            prod_label = str(row.get("Produto", "") or "").strip()
            size = str(row.get("Tamanho", "") or "").strip()
            qty = int(row.get("Quantidade") or 0)
            if not prod_label or qty <= 0:
                continue
            code_guess = prod_label.split(" - ")[0].strip() if " - " in prod_label else prod_label[:10]
            key = f"{code_guess}|{size}"
            pid = product_key_to_id.get(key)
            if not pid:
                pid = norm_id_part(f"{code_guess}_{size}")
            unit_cost = parse_money(row.get("Custo"))
            total = parse_money(row.get("Total")) or qty * unit_cost
            move_ref = org_ref.collection("stockMovements").document()
            move_ref.set(
                {
                    "date": excel_serial_to_datetime(row.get("Data")) or datetime.now(timezone.utc),
                    "productId": pid,
                    "productCode": code_guess,
                    "productName": prod_label,
                    "size": size,
                    "quantity": qty,
                    "unitCost": unit_cost,
                    "total": total,
                    "type": "purchase_in",
                    "createdAt": firestore.SERVER_TIMESTAMP,
                }
            )

    # --- Financeiro ---
    fin_in = 0.0
    fin_out = 0.0
    if "Financeiro" in xl.sheet_names:
        df_f = pd.read_excel(xl, "Financeiro", header=2)
        df_f.columns = [str(c).strip() for c in df_f.columns]
        for _, row in df_f.iterrows():
            tipo = str(row.get("Tipo", "") or "").strip().lower()
            val = parse_money(row.get("Valor"))
            if val <= 0:
                continue
            tx_ref = org_ref.collection("financialTransactions").document()
            kind = "entrada" if "entr" in tipo else "saida"
            if kind == "entrada":
                fin_in += val
            else:
                fin_out += val
            tx_ref.set(
                {
                    "date": excel_serial_to_datetime(row.get("Data")) or datetime.now(timezone.utc),
                    "type": kind,
                    "category": "" if pd.isna(row.get("Categoria")) else str(row.get("Categoria")),
                    "description": "" if pd.isna(row.get("Descrição")) else str(row.get("Descrição")),
                    "amount": val,
                    "paymentMethod": "" if pd.isna(row.get("Forma de Pagamento")) else str(row.get("Forma de Pagamento")),
                    "status": "" if pd.isna(row.get("Status")) else str(row.get("Status")),
                    "createdAt": firestore.SERVER_TIMESTAMP,
                }
            )

    # --- Vendas: nova linha com Data explícita inicia venda; linhas sem Data prolongam a venda ---
    revenue = 0.0
    profit = 0.0
    sale_count = 0
    payment_mix: dict[str, float] = {}

    if "Vendas" in xl.sheet_names:
        df_v = pd.read_excel(xl, "Vendas")
        df_v.columns = [str(c).strip() for c in df_v.columns]

        current_date: datetime | None = None
        current_client: str | None = None
        current_payment = ""
        current_status = ""
        recv = 0.0
        pend = 0.0
        lines: list[dict[str, Any]] = []

        def resolve_client_id(cid_name: str) -> str:
            if cid_name in client_name_to_id:
                return client_name_to_id[cid_name]
            cid = norm_id_part(cid_name)
            org_ref.collection("clients").document(cid).set(
                {
                    "code": cid[:8],
                    "name": cid_name,
                    "totalPurchased": 0,
                    "purchaseCount": 0,
                    "avgTicket": 0,
                },
                merge=True,
            )
            client_name_to_id[cid_name] = cid
            return cid

        def flush_sale():
            nonlocal revenue, profit, sale_count, payment_mix
            if not lines or current_date is None or not current_client:
                return
            cid_name = str(current_client).strip()
            client_id = resolve_client_id(cid_name)
            subtotal = sum(float(x["lineTotal"]) for x in lines)
            total_profit = sum(float(x["lineProfit"]) for x in lines)
            sale_ref = org_ref.collection("sales").document()
            sale_ref.set(
                {
                    "clientId": client_id,
                    "clientName": cid_name,
                    "date": current_date,
                    "paymentMethod": current_payment,
                    "status": current_status,
                    "amountReceived": recv,
                    "amountPending": pend,
                    "subtotal": subtotal,
                    "totalProfit": total_profit,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                }
            )
            for ln in lines:
                sale_ref.collection("items").document().set(ln)
            revenue += subtotal
            profit += total_profit
            sale_count += 1
            pm = current_payment or "—"
            payment_mix[pm] = payment_mix.get(pm, 0.0) + subtotal

        for _, row in df_v.iterrows():
            raw_date = row.get("Data")
            client_cell = row.get("Cliente")

            if pd.notna(raw_date):
                if lines:
                    flush_sale()
                    lines = []
                current_date = excel_serial_to_datetime(raw_date) or datetime.now(timezone.utc)
                if client_cell is not None and not (isinstance(client_cell, float) and pd.isna(client_cell)):
                    current_client = str(client_cell).strip()
                current_payment = "" if pd.isna(row.get("Forma de Pagamento")) else str(row.get("Forma de Pagamento"))
                current_status = "" if pd.isna(row.get("Status")) else str(row.get("Status"))
                recv = parse_money(row.get("Valor Recebido"))
                pend = parse_money(row.get("Valor Pendente"))
            elif client_cell is not None and not (isinstance(client_cell, float) and pd.isna(client_cell)):
                new_c = str(client_cell).strip()
                if current_client and new_c != current_client and lines:
                    flush_sale()
                    lines = []
                current_client = new_c

            prod_label = str(row.get("Produto", "") or "").strip()
            size = str(row.get("Tamanho", "") or "").strip()
            qty = int(row.get("Quantidade") or 0)
            unit_price = parse_money(row.get("Valor Unitário"))
            line_total = parse_money(row.get("Total"))
            unit_cost = parse_money(row.get("Custo Unitário"))
            if not prod_label or qty <= 0 or current_date is None or not current_client:
                continue
            code_guess = prod_label.split(" - ")[0].strip() if " - " in prod_label else prod_label[:10]
            key = f"{code_guess}|{size}"
            pid = product_key_to_id.get(key) or norm_id_part(f"{code_guess}_{size}")
            line_total_eff = line_total if line_total else qty * unit_price
            line_profit = qty * (unit_price - unit_cost)
            lines.append(
                {
                    "productId": pid,
                    "productCode": code_guess,
                    "productName": prod_label,
                    "size": size,
                    "quantity": qty,
                    "unitPrice": unit_price,
                    "unitCost": unit_cost,
                    "lineTotal": line_total_eff,
                    "lineProfit": line_profit,
                }
            )
        flush_sale()

    avg_ticket = revenue / sale_count if sale_count else 0
    org_ref.collection("meta").document("dashboard").set(
        {
            "revenueTotal": revenue,
            "profitTotal": profit,
            "saleCount": sale_count,
            "avgTicket": avg_ticket,
            "paymentMix": payment_mix,
            "financialIn": fin_in,
            "financialOut": fin_out,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    print(f"Import concluído para organizations/{args.org_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
