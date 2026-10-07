#!/usr/bin/env python3
"""Generate the deterministic local catalogue manifest from Casa del Rulimán's workbook.

Usage:
    python3 scripts/generate-client-template-manifest.py \
      '/path/to/PLANTILLAS PIM(1) (1).xlsx'

The generated JSON is runtime input for the local/test seed. Production data still arrives
through the ERP and the PIM import endpoints. This script deliberately keeps spreadsheet
parsing out of the API runtime and records the source SHA-256 for traceability.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


SPECIAL_SHEETS = {"BUSQUEDA", "OEM", "HOMOLOGOS", "APLICACIONES"}
ASSET_CHARACTERS = {"ARCHIVO", "IMAGEN", "ARCHIVO / IMAGEN", "ARCHIVO/IMAGEN"}
BASE_KEYS = {
    "codigo articulo": "codigo_articulo",
    "codigo de articulo": "codigo_articulo",
    "codigo proveedor": "codigo_proveedor",
    "codigo de proveedor": "codigo_proveedor",
    "codigo unificador": "codigo_unificador",
    "linea": "linea",
    "codigo de linea": "linea",
    "tipo de aplicacion": "tipo_aplicacion",
    "marca": "marca",
    "frecuencia": "frecuencia_articulo",
    "ecommerce": "ecommerce",
    "bloqueado venta": "bloqueado_venta",
    "bloqueado compra": "bloqueado_compra",
    "especificacion observacion": "especificacion_observacion",
}
BASE_ERP_KEYS = set(BASE_KEYS.values())
EMPTY_MARKERS = {"", "-", "#value!", "none"}


def cell_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("_x000D_", "").strip()


def fold(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", cell_text(value))
    without_marks = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", without_marks).strip().casefold()


def words(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", fold(value)).strip()


def slug(value: object, limit: int = 100) -> str:
    return re.sub(r"[^a-z0-9]+", "-", fold(value)).strip("-")[:limit]


def attribute_key(value: object) -> str:
    normalized = words(value)
    return BASE_KEYS.get(normalized, normalized.replace(" ", "_")[:100])


def yes(value: object) -> bool:
    return fold(value) in {"si", "s", "genera el sistema"}


def source_authority(value: object, key: str) -> str:
    if key in BASE_ERP_KEYS:
        return "erp"
    normalized = fold(value)
    if "erp" in normalized:
        return "erp"
    if "genera el sistema" in normalized:
        return "calculated"
    # "USUARIO" and "FUENTE EXTERNA" are both accepted through reviewed PIM input/imports.
    return "pim"


def meaningful(value: object) -> bool:
    return fold(value) not in EMPTY_MARKERS


def parse_number(value: object) -> float | int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    raw = cell_text(value).replace(" ", "").replace(",", ".")
    if not re.fullmatch(r"[-+]?\d+(?:\.\d+)?", raw):
        return None
    parsed = float(raw)
    return int(parsed) if parsed.is_integer() else parsed


def parse_boolean(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    normalized = fold(value)
    if normalized == "si":
        return True
    if normalized == "no":
        return False
    return None


def explicit_unit(label: str) -> str | None:
    normalized = fold(label).replace("º", "°")
    candidates = [
        (r"(?:\[|\(|\s)mm(?:\]|\)|\s|:|$)", "mm"),
        (r"(?:\[|\(|\s)kg(?:\]|\)|\s|:|$)", "kg"),
        (r"(?:\[|\(|\s)nm(?:\]|\)|\s|:|$)", "Nm"),
        (r"(?:\[|\(|\s)°c(?:\]|\)|\s|:|$)", "°C"),
    ]
    return next((unit for pattern, unit in candidates if re.search(pattern, normalized)), None)


def asset_type(label: str) -> str | None:
    normalized = words(label)
    if "msds" in normalized or "seguridad" in normalized:
        return "MSDS"
    if "certificado" in normalized:
        return "CERT"
    if "fotografia" in normalized or "foto" in normalized:
        return "FOTO"
    if "plano" in normalized:
        return "PLANO"
    if "ficha tecnica" in normalized:
        return "FT"
    return None


def find_header_row(sheet: Any) -> int:
    for row in range(1, min(sheet.max_row, 20) + 1):
        if any(
            words(sheet.cell(row, column).value) in {"codigo articulo", "codigo de articulo"}
            for column in range(1, sheet.max_column + 1)
        ):
            return row
    raise ValueError(f"{sheet.title}: no se encontró la fila de encabezados")


def sheet_number(title: str) -> str | None:
    match = re.match(r"^\s*(\d+(?:\.\d+)?)\.?", title)
    return match.group(1) if match else None


def read_search_matrix(book: Any) -> list[dict[str, Any]]:
    sheet = book["BUSQUEDA"]
    rows: list[dict[str, Any]] = []
    for row in range(2, sheet.max_row + 1):
        name = cell_text(sheet.cell(row, 2).value)
        if not name:
            continue
        raw_number = cell_text(sheet.cell(row, 1).value).rstrip(".")
        priorities = {
            "tecdoc": sheet.cell(row, 4).value,
            "fabricante": sheet.cell(row, 5).value,
            "archivo": sheet.cell(row, 6).value,
            "manual": sheet.cell(row, 7).value,
        }
        rows.append(
            {
                "excelRow": row,
                "number": raw_number or None,
                "name": name,
                "slug": slug(name),
                "application": cell_text(sheet.cell(row, 3).value) or None,
                "sourcePriority": {
                    key: int(value)
                    for key, value in priorities.items()
                    if isinstance(value, (int, float))
                },
            }
        )
    return rows


def relation_rows(sheet: Any) -> list[dict[str, object]]:
    header_row = 10
    headers = [attribute_key(sheet.cell(header_row, column).value) for column in range(1, sheet.max_column + 1)]
    rows: list[dict[str, object]] = []
    for row in range(header_row + 1, sheet.max_row + 1):
        record: dict[str, object] = {}
        for column, key in enumerate(headers, 1):
            if not key:
                continue
            value = sheet.cell(row, column).value
            if meaningful(value):
                record[key] = value
        if record:
            rows.append(record)
    return rows


def main() -> None:
    if len(sys.argv) not in {2, 3}:
        raise SystemExit("usage: generate-client-template-manifest.py INPUT.xlsx [OUTPUT.json]")
    source_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = (
        Path(sys.argv[2]).expanduser().resolve()
        if len(sys.argv) == 3
        else Path(__file__).resolve().parents[1]
        / "apps/api/src/database/client-template-manifest.json"
    )
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    book = load_workbook(source_path, data_only=True, read_only=False)
    search_matrix = read_search_matrix(book)
    search_by_number = {row["number"]: row for row in search_matrix if row["number"]}

    raw_templates: list[dict[str, Any]] = []
    occurrences: dict[str, list[dict[str, Any]]] = defaultdict(list)
    used_slugs: set[str] = set()

    for sheet in book.worksheets:
        if sheet.title in SPECIAL_SHEETS:
            continue
        header_row = find_header_row(sheet)
        matrix = search_by_number.get(sheet_number(sheet.title))
        template_name = matrix["name"] if matrix else re.sub(r"^\s*\d+(?:\.\d+)?\.?\s*", "", sheet.title).strip()
        template_slug = slug(template_name)
        if template_slug in used_slugs:
            template_slug = f"{template_slug}-{slug(sheet_number(sheet.title) or sheet.title)}"
        used_slugs.add(template_slug)

        attributes: list[dict[str, Any]] = []
        assets: list[dict[str, Any]] = []
        for column in range(3, sheet.max_column + 1):
            label = cell_text(sheet.cell(header_row, column).value)
            if not label:
                continue
            character = cell_text(sheet.cell(1, column).value).upper()
            if character in ASSET_CHARACTERS:
                kind = asset_type(label)
                if kind and kind not in {item["type"] for item in assets}:
                    assets.append({"type": kind, "required": fold(sheet.cell(2, column).value) == "obligatorio"})
                continue
            candidate_key = attribute_key(label)
            identity = candidate_key if candidate_key in BASE_ERP_KEYS else words(label)
            raw_values = [
                sheet.cell(row, column).value
                for row in range(header_row + 1, sheet.max_row + 1)
                if meaningful(sheet.cell(row, column).value)
            ]
            occurrence = {
                "identity": identity,
                "candidateKey": candidate_key,
                "label": label,
                "character": character,
                "receives": cell_text(sheet.cell(3, column).value),
                "unit": explicit_unit(label),
                "rawValues": raw_values,
            }
            occurrences[identity].append(occurrence)
            attributes.append(
                {
                    "identity": identity,
                    "column": column,
                    "required": fold(sheet.cell(2, column).value) == "obligatorio",
                    "replicable": yes(sheet.cell(4, column).value),
                    "includeInTechnicalSheet": yes(sheet.cell(5, column).value),
                    "roles": {
                        "ADMINISTRADOR": yes(sheet.cell(7, column).value),
                        "COMPRAS": yes(sheet.cell(8, column).value),
                        "VENTAS": yes(sheet.cell(9, column).value),
                    },
                }
            )

        products: list[dict[str, Any]] = []
        for row in range(header_row + 1, sheet.max_row + 1):
            raw_sku = sheet.cell(row, 3).value
            if not meaningful(raw_sku) or fold(raw_sku) == "plano":
                continue
            values = {
                item["identity"]: sheet.cell(row, item["column"]).value
                for item in attributes
                if meaningful(sheet.cell(row, item["column"]).value)
            }
            products.append({"excelRow": row, "rawValues": values})

        raw_templates.append(
            {
                "sheet": sheet.title,
                "slug": template_slug,
                "name": template_name,
                "application": matrix["application"] if matrix else None,
                "headerRow": header_row,
                "attributes": attributes,
                "assets": assets,
                "products": products,
            }
        )

    candidate_identities: dict[str, list[str]] = defaultdict(list)
    for identity, entries in occurrences.items():
        candidate_identities[entries[0]["candidateKey"]].append(identity)
    identity_to_key: dict[str, str] = {}
    for identity, entries in occurrences.items():
        candidate = entries[0]["candidateKey"]
        if len(candidate_identities[candidate]) == 1:
            identity_to_key[identity] = candidate
        else:
            suffix = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:6]
            identity_to_key[identity] = f"{candidate[:93]}_{suffix}"

    definitions: list[dict[str, Any]] = []
    definition_by_identity: dict[str, dict[str, Any]] = {}
    for identity, entries in occurrences.items():
        key = identity_to_key[identity]
        values = [value for entry in entries for value in entry["rawValues"] if meaningful(value)]
        numeric_declared = all(entry["character"].startswith("NUMERICO") for entry in entries)
        all_numeric = bool(values) and all(parse_number(value) is not None for value in values)
        all_boolean = bool(values) and all(parse_boolean(value) is not None for value in values)
        units = {entry["unit"] for entry in entries if entry["unit"]}
        unit = next(iter(units)) if len(units) == 1 and numeric_declared and all_numeric else None
        data_type = (
            "boolean"
            if all_boolean
            else "measurement"
            if unit
            else "number"
            if numeric_declared and all_numeric
            else "text"
        )
        source = source_authority(entries[0]["receives"], key)
        definition = {
            "key": key,
            "label": entries[0]["label"],
            "dataType": data_type,
            "unit": unit,
            "sourceAuthority": source,
        }
        definitions.append(definition)
        definition_by_identity[identity] = definition

    templates: list[dict[str, Any]] = []
    product_count = 0
    for raw_template in raw_templates:
        attributes = []
        raw_attribute_by_identity = {item["identity"]: item for item in raw_template["attributes"]}
        for item in raw_template["attributes"]:
            definition = definition_by_identity[item["identity"]]
            roles = {
                role: {
                    "canView": visible,
                    "canEdit": visible and role != "VENTAS" and definition["sourceAuthority"] == "pim",
                    "canImport": visible and role != "VENTAS" and definition["sourceAuthority"] == "pim",
                    "canExport": visible,
                }
                for role, visible in item["roles"].items()
            }
            attributes.append(
                {
                    "key": definition["key"],
                    "required": item["required"],
                    "replicable": item["replicable"],
                    "searchable": True,
                    "includeInTechnicalSheet": item["includeInTechnicalSheet"],
                    "roles": roles,
                }
            )
        products = []
        for raw_product in raw_template["products"]:
            converted: dict[str, object] = {}
            for identity, value in raw_product["rawValues"].items():
                definition = definition_by_identity[identity]
                if definition["dataType"] in {"number", "measurement"}:
                    converted_value = parse_number(value)
                elif definition["dataType"] == "boolean":
                    converted_value = parse_boolean(value)
                else:
                    converted_value = cell_text(value)
                if converted_value is not None and meaningful(converted_value):
                    converted[definition["key"]] = converted_value
            sku = cell_text(converted.get("codigo_articulo"))
            provider = cell_text(converted.get("codigo_proveedor"))
            unified = cell_text(converted.get("codigo_unificador"))
            line = cell_text(converted.get("linea"))
            application = cell_text(converted.get("tipo_aplicacion"))
            brand = cell_text(converted.get("marca"))
            if not sku or not unified:
                raise ValueError(f"{raw_template['sheet']} fila {raw_product['excelRow']}: SKU/código unificador vacío")
            products.append(
                {
                    "excelRow": raw_product["excelRow"],
                    "sku": sku,
                    "providerCode": provider,
                    "unifiedCode": unified,
                    "name": provider or f"{line} {sku}".strip(),
                    "line": line,
                    "application": application,
                    "brand": brand,
                    "values": converted,
                }
            )
        product_count += len(products)
        templates.append(
            {
                key: value
                for key, value in raw_template.items()
                if key not in {"products", "attributes"}
            }
            | {"attributes": attributes, "products": products}
        )

    categories = []
    for row in search_matrix:
        matching = next(
            (template for template in templates if sheet_number(template["sheet"]) == row["number"]),
            None,
        )
        categories.append(
            row
            | {
                "defined": matching is not None,
                "templateSheet": matching["sheet"] if matching else None,
                "slug": matching["slug"] if matching else row["slug"],
            }
        )

    product_skus = [
        product["sku"]
        for template in templates
        for product in template["products"]
    ]
    duplicate_skus = sorted(
        sku for sku in set(product_skus) if product_skus.count(sku) > 1
    )
    if duplicate_skus:
        raise ValueError(f"SKU duplicados en las plantillas: {', '.join(duplicate_skus)}")

    unified_codes = {
        product["unifiedCode"]
        for template in templates
        for product in template["products"]
    }
    relations = {
        "oem": relation_rows(book["OEM"]),
        "homologs": relation_rows(book["HOMOLOGOS"]),
        "applications": relation_rows(book["APLICACIONES"]),
    }
    unknown_relation_codes = sorted(
        {
            cell_text(relation.get("codigo_unificador"))
            for records in relations.values()
            for relation in records
            if cell_text(relation.get("codigo_unificador")) not in unified_codes
        }
    )
    if unknown_relation_codes:
        raise ValueError(
            "Relaciones con código unificador inexistente: "
            + ", ".join(unknown_relation_codes)
        )

    manifest = {
        "version": 1,
        "source": {
            "fileName": source_path.name,
            "sha256": source_hash,
            "sheetCount": len(book.sheetnames),
            "templateCount": len(templates),
            "productCount": product_count,
        },
        "categories": categories,
        "definitions": sorted(definitions, key=lambda item: item["key"]),
        "templates": templates,
        "relations": relations,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"generated {output_path}: {len(templates)} templates, "
        f"{len(definitions)} definitions, {product_count} products"
    )


if __name__ == "__main__":
    main()
