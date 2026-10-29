"""Dry-run report-to-mock API validation. GET only; never posts to the app or DB."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime
import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen


ENTITIES = (
    "products", "product-groups", "resources", "structures", "routings", "routings-basic",
    "production-orders", "commitments", "sales-order-headers", "sales-order-lines", "appointments",
)


class FlowError(RuntimeError):
    pass


class ReadOnlyMockClient:
    def __init__(self, base_url: str, timeout: float = 30, retries: int = 2):
        parsed = urlparse(base_url)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("Por segurança, a pré-validação só consulta a API mock em loopback HTTP.")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.counts = {}

    def get(self, path: str) -> dict:
        url = self.base_url + path
        for attempt in range(self.retries + 1):
            try:
                with urlopen(url, timeout=self.timeout) as response:
                    if response.status != 200:
                        raise FlowError(f"GET retornou HTTP {response.status}: {path}")
                    data = json.loads(response.read().decode("utf-8"))
                    if not isinstance(data, dict):
                        raise FlowError(f"Resposta não é um objeto JSON: {path}")
                    return data
            except HTTPError as error:
                if error.code in {429, 500, 502, 503, 504} and attempt < self.retries:
                    time.sleep(0.25 * (2 ** attempt))
                    continue
                raise FlowError(f"API respondeu HTTP {error.code}: {path}") from error
            except (URLError, TimeoutError, OSError) as error:
                if attempt < self.retries:
                    time.sleep(0.25 * (2 ** attempt))
                    continue
                raise FlowError(f"Falha de conexão após {attempt + 1} tentativa(s): {error}") from error
            except json.JSONDecodeError as error:
                raise FlowError(f"JSON inválido recebido em {path}") from error
        raise FlowError(f"Não foi possível consultar {path}")

    def health(self):
        health = self.get("/v1/health")
        if health.get("simulation") is not True or health.get("readOnly") is not True:
            raise FlowError("A origem não se identificou como simulação local somente leitura.")
        if health.get("writesToApplication") is not False or health.get("connectsToProtheus") is not False:
            raise FlowError("A origem declara escrita ou conexão externa; pré-validação cancelada.")
        return health

    def records(self, entity: str):
        cursor = None
        seen_cursors = set()
        expected_total = None
        received = 0
        page = 0
        while True:
            query = {"stream": "true", "pageSize": "500"}
            if cursor:
                query["cursor"] = cursor
            payload = self.get(f"/v1/{entity}?{urlencode(query)}")
            if payload.get("simulation") is not True or payload.get("readOnly") is not True:
                raise FlowError(f"{entity}: resposta sem marcador de simulação somente leitura")
            rows = payload.get("records")
            if not isinstance(rows, list):
                raise FlowError(f"{entity}: campo records ausente ou inválido")
            if expected_total is None:
                expected_total = payload.get("sourceRows")
            elif payload.get("sourceRows") != expected_total:
                raise FlowError(f"{entity}: total de origem mudou durante a paginação")
            page += 1
            received += len(rows)
            for row in rows:
                if not isinstance(row, dict):
                    raise FlowError(f"{entity}: registro da página {page} não é um objeto")
                yield row
            next_cursor = payload.get("nextCursor")
            if not next_cursor:
                break
            if next_cursor in seen_cursors:
                raise FlowError(f"{entity}: cursor repetido; interrupção para evitar loop")
            seen_cursors.add(next_cursor)
            cursor = next_cursor
        if expected_total is not None and received != expected_total:
            raise FlowError(f"{entity}: recebidos {received} de {expected_total} registros")
        self.counts[entity] = received


def _missing(record: dict, fields: tuple[str, ...]) -> list[str]:
    return [field for field in fields if record.get(field) is None or (isinstance(record.get(field), str) and not record[field].strip())]


def _valid_source_date(value) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    value = value.strip()
    try:
        if len(value) >= 10 and value[4:5] == "-":
            date.fromisoformat(value[:10])
        elif len(value) == 8 and value.isdigit():
            date(int(value[:4]), int(value[4:6]), int(value[6:8]))
        else:
            datetime.strptime(value, "%d/%m/%Y")
        return True
    except ValueError:
        return False


def _key_part(value) -> str:
    return "" if value is None else str(value).strip()


def run_preflight(client: ReadOnlyMockClient) -> dict:
    """Read every available page and return a compatibility report; never writes."""
    report = {
        "mode": "SIMULATION_DRY_RUN",
        "status": "BLOCKED",
        "databaseWritePerformed": False,
        "sourceConnection": "MOCK_LOOPBACK_ONLY",
        "datasets": {},
        "checks": {},
        "blockers": [],
        "warnings": [],
    }
    client.health()

    products: set[str] = set()
    product_groups: set[str] = set()
    product_group_refs: list[str] = []
    duplicate_products = missing_product_fields = product_rows_with_missing = 0
    product_missing_by_field = Counter()
    for row in client.records("products"):
        missing = _missing(row, ("productCode", "description", "type", "unit"))
        product_rows_with_missing += bool(missing)
        missing_product_fields += len(missing)
        product_missing_by_field.update(missing)
        code = row.get("productCode")
        if code and code in products:
            duplicate_products += 1
        elif code:
            products.add(code)
        if row.get("groupCode"):
            product_group_refs.append(row["groupCode"])
    report["datasets"]["products"] = {"rows": client.counts["products"], "uniqueCodes": len(products), "duplicateCodeRows": duplicate_products, "recordsWithMissingRequiredValues": product_rows_with_missing, "missingRequiredValues": missing_product_fields, "missingByField": dict(product_missing_by_field)}

    missing_group_fields = 0
    group_missing_by_field = Counter()
    for row in client.records("product-groups"):
        if row.get("groupCode"):
            product_groups.add(row["groupCode"])
        missing = _missing(row, ("groupCode", "description"))
        missing_group_fields += len(missing)
        group_missing_by_field.update(missing)
    unmapped_groups = sum(1 for group in product_group_refs if group not in product_groups)
    report["datasets"]["productGroups"] = {"rows": client.counts["product-groups"], "uniqueCodes": len(product_groups), "missingRequiredValues": missing_group_fields, "missingByField": dict(group_missing_by_field)}
    report["checks"]["productGroupReferences"] = {"unmappedRows": unmapped_groups}

    resources_by_branch: set[tuple[str, str]] = set()
    resource_codes: set[str] = set()
    resource_rows = missing_resource_values = 0
    resource_missing_by_field = Counter()
    resource_location_fields_populated = Counter()
    for row in client.records("resources"):
        resource_rows += 1
        branch, code = _key_part(row.get("branch")), _key_part(row.get("resourceCode"))
        if branch and code:
            resources_by_branch.add((branch, code))
            resource_codes.add(code)
        missing = _missing(row, ("branch", "resourceCode", "resourceName"))
        missing_resource_values += len(missing)
        resource_missing_by_field.update(missing)
        for field in ("productionLineRaw", "workCenterRaw"):
            resource_location_fields_populated[field] += bool(row.get(field))
    report["datasets"]["resourcesSH1"] = {
        "rows": resource_rows,
        "uniqueBranchCodeKeys": len(resources_by_branch),
        "missingRequiredValues": missing_resource_values,
        "missingByField": dict(resource_missing_by_field),
        "rowsWithProductionLine": resource_location_fields_populated["productionLineRaw"],
        "rowsWithWorkCenter": resource_location_fields_populated["workCenterRaw"],
        "departmentFieldAvailable": False,
    }

    structure_parents: set[str] = set()
    structure_components: set[str] = set()
    missing_structure_fields = structure_rows_with_missing = 0
    structure_missing_by_field = Counter()
    for row in client.records("structures"):
        parent, component = row.get("parentProductCode"), row.get("componentCode")
        if parent:
            structure_parents.add(parent)
        if component:
            structure_components.add(component)
        missing = _missing(row, ("parentProductCode", "componentCode", "quantity", "unit"))
        structure_rows_with_missing += bool(missing)
        missing_structure_fields += len(missing)
        structure_missing_by_field.update(missing)
    report["datasets"]["structures"] = {"rows": client.counts["structures"], "uniqueParents": len(structure_parents), "uniqueComponents": len(structure_components), "recordsWithMissingRequiredValues": structure_rows_with_missing, "missingRequiredValues": missing_structure_fields, "missingByField": dict(structure_missing_by_field)}
    report["checks"]["structureProductReferences"] = {
        "parentsMissingFromProductCatalog": len(structure_parents - products),
        "componentsMissingFromProductCatalog": len(structure_components - products),
    }
    report["blockers"].append("Estruturas têm revisão inicial e final separadas; o modelo atual aceita apenas um campo de revisão.")

    routing_products: set[str] = set()
    routing_resource_refs: set[tuple[str, str]] = set()
    routing_resource_codes: set[str] = set()
    verified_resource_products: set[str] = set()
    routing_rows = missing_routing_fields = 0
    routing_missing_by_field = Counter()
    for row in client.records("routings"):
        routing_rows += 1
        if row.get("productCode"):
            routing_products.add(row["productCode"])
        branch, resource_code = _key_part(row.get("branch")), _key_part(row.get("resource"))
        if branch and resource_code:
            routing_resource_refs.add((branch, resource_code))
            routing_resource_codes.add(resource_code)
            if (branch, resource_code) in resources_by_branch and row.get("productCode"):
                verified_resource_products.add(row["productCode"])
        missing = _missing(row, ("productCode", "routingCode", "operationSequence", "operationDescription"))
        missing_routing_fields += len(missing)
        routing_missing_by_field.update(missing)
    report["datasets"]["routings"] = {"rows": routing_rows, "missingRequiredValues": missing_routing_fields, "missingByField": dict(routing_missing_by_field)}
    report["checks"]["routingProductReferences"] = {"productsMissingFromProductCatalog": len(routing_products - products)}
    unresolved_resource_refs = routing_resource_refs - resources_by_branch
    same_code_other_branch = sum(1 for _branch, code in unresolved_resource_refs if code in resource_codes)
    report["checks"]["routingResourceReferences"] = {
        "referencesMissingFromSH1ByBranchAndCode": len(unresolved_resource_refs),
        "matchingCodeButBranchMismatch": same_code_other_branch,
        "routeProductsWithVerifiedResource": len(verified_resource_products),
    }
    report["blockers"].append("Roteiros não trazem código de operação separado e a unidade de Tempo Padrão precisa ser confirmada.")
    if unresolved_resource_refs or not resource_rows or not (resource_location_fields_populated["productionLineRaw"] or resource_location_fields_populated["workCenterRaw"]):
        report["blockers"].append("SH1 cadastra recursos, mas o vínculo filial/recurso com os roteiros e os campos de setor (linha de produção/centro de trabalho) precisam ser confirmados; o mock não atribui setor às OPs.")

    order_products: set[str] = set()
    order_keys: set[str] = set()
    duplicate_orders = missing_order_fields = missing_actual_end = invalid_order_dates = 0
    order_missing_by_field = Counter()
    for row in client.records("production-orders"):
        key, product = row.get("sourceCompositeKey"), row.get("productCode")
        if key:
            if key in order_keys:
                duplicate_orders += 1
            order_keys.add(key)
        if product:
            order_products.add(product)
        missing = _missing(row, ("sourceCompositeKey", "productCode", "plannedQuantity", "producedQuantity", "issuedAtRaw", "dueDateRaw"))
        missing_order_fields += len(missing)
        order_missing_by_field.update(missing)
        invalid_order_dates += not _valid_source_date(row.get("issuedAtRaw"))
        invalid_order_dates += not _valid_source_date(row.get("dueDateRaw"))
        missing_actual_end += not bool(row.get("actualEndRaw"))
    report["datasets"]["productionOrders"] = {"rows": client.counts["production-orders"], "uniqueKeys": len(order_keys), "duplicateKeyRows": duplicate_orders, "missingRequiredValues": missing_order_fields, "missingByField": dict(order_missing_by_field), "invalidRequiredDates": invalid_order_dates, "missingActualEndDates": missing_actual_end}
    report["checks"]["productionOrderProductReferences"] = {"productsMissingFromProductCatalog": len(order_products - products)}
    report["blockers"].append("O relatório de OP não contém saldo, refugo nem status oficial mapeável; esses campos não serão derivados.")

    commitment_orders: set[str] = set()
    commitment_products: set[str] = set()
    for row in client.records("commitments"):
        if row.get("productionOrder"):
            commitment_orders.add(row["productionOrder"])
        if row.get("productCode"):
            commitment_products.add(row["productCode"])
    report["datasets"]["commitments"] = {"rows": client.counts["commitments"], "uniqueOrderReferences": len(commitment_orders), "uniqueProductReferences": len(commitment_products)}
    report["checks"]["commitmentReferences"] = {
        "ordersMissingFromProductionOrderReport": len(commitment_orders - order_keys),
        "productsMissingFromProductCatalog": len(commitment_products - products),
    }
    report["blockers"].append("Empenhos não têm entidade/tabela correspondente no espelho atual da aplicação.")

    sales_headers = 0
    missing_header_keys = 0
    invalid_header_dates = Counter()
    for row in client.records("sales-order-headers"):
        sales_headers += 1
        missing_header_keys += len(_missing(row, ("branch", "orderNumber", "customerCode")))
        for field in ("issuedAtRaw", "headerDueDateRaw"):
            if not _valid_source_date(row.get(field)):
                invalid_header_dates[field] += 1
    report["datasets"]["salesOrderHeadersSC5"] = {"rows": sales_headers, "missingRequiredHeaderValues": missing_header_keys, "invalidDatesByField": dict(invalid_header_dates)}
    sales_line_rows = missing_sales_line_values = invalid_sales_line_dates = missing_sales_line_dates = 0
    sales_line_missing_by_field = Counter()
    sales_line_products: set[str] = set()
    invalid_sales_line_quantities = 0
    for row in client.records("sales-order-lines"):
        sales_line_rows += 1
        missing = _missing(row, ("branch", "salesOrderItem", "productCode", "unit", "orderedQuantity"))
        missing_sales_line_values += len(missing)
        sales_line_missing_by_field.update(missing)
        if row.get("productCode"):
            sales_line_products.add(row["productCode"])
        quantity = row.get("orderedQuantity")
        if quantity is not None and (not isinstance(quantity, (int, float)) or quantity < 0):
            invalid_sales_line_quantities += 1
        delivery_date = row.get("deliveryDateRaw")
        if delivery_date is None or (isinstance(delivery_date, str) and not delivery_date.strip()):
            missing_sales_line_dates += 1
        elif not _valid_source_date(delivery_date):
            invalid_sales_line_dates += 1
    report["datasets"]["salesOrderLinesSC6"] = {
        "available": True,
        "rows": sales_line_rows,
        "missingRequiredValues": missing_sales_line_values,
        "missingByField": dict(sales_line_missing_by_field),
        "invalidOrderedQuantities": invalid_sales_line_quantities,
        "missingDeliveryDates": missing_sales_line_dates,
        "invalidDeliveryDates": invalid_sales_line_dates,
        "parentOrderKeyAvailable": False,
    }
    report["checks"]["salesOrderLineReferences"] = {
        "productsMissingFromProductCatalog": len(sales_line_products - products),
        "linesWithoutOrderLinkKey": sales_line_rows,
        "headersNotVerifiableAgainstLines": sales_headers,
    }
    report["blockers"].append("SC6 fornece linhas, mas não contém C6_NUM; sem o número do pedido de venda não é possível vincular itens aos cabeçalhos SC5.")

    appointment_rows = missing_appointment_values = invalid_appointment_dates = 0
    appointment_missing_by_field = Counter()
    appointments_linkable = observations_without_order_key = invalid_produced_quantities = 0
    for row in client.records("appointments"):
        appointment_rows += 1
        missing = _missing(row, ("orderNumber", "productCode", "operationRaw", "startedAtDateRaw", "startedAtTimeRaw", "endedAtDateRaw", "endedAtTimeRaw", "producedQuantity"))
        missing_appointment_values += len(missing)
        appointment_missing_by_field.update(missing)
        if row.get("orderNumber") and row.get("operationRaw"):
            appointments_linkable += 1
        if row.get("observationsRaw") and not row.get("orderNumber"):
            observations_without_order_key += 1
        quantity = row.get("producedQuantity")
        if quantity is not None and (not isinstance(quantity, (int, float)) or quantity < 0):
            invalid_produced_quantities += 1
        for field in ("startedAtDateRaw", "endedAtDateRaw"):
            value = row.get(field)
            if value is not None and str(value).strip() and not _valid_source_date(value):
                invalid_appointment_dates += 1
    report["datasets"]["appointmentsSH6"] = {
        "rows": appointment_rows,
        "missingCriticalValues": missing_appointment_values,
        "missingByField": dict(appointment_missing_by_field),
        "rowsLinkableByOrderAndOperation": appointments_linkable,
        "rowsWithObservationButNoOrderKey": observations_without_order_key,
        "invalidProducedQuantities": invalid_produced_quantities,
        "invalidDates": invalid_appointment_dates,
    }
    if appointment_rows == 0 or appointments_linkable != appointment_rows:
        report["blockers"].append("O relatório de apontamentos não tem número de OP e operação preenchidos em todas as linhas; observações não são interpretadas como chaves.")

    if duplicate_products or duplicate_orders or unmapped_groups or missing_product_fields or missing_structure_fields or missing_routing_fields or missing_order_fields or missing_sales_line_values or invalid_sales_line_quantities or missing_resource_values or missing_appointment_values:
        report["warnings"].append("Há chaves duplicadas, referências sem correspondência ou valores obrigatórios vazios; consultar os contadores por conjunto antes de qualquer integração real.")
    report["status"] = "BLOCKED" if report["blockers"] else "READY"
    return report


def main():
    parser = argparse.ArgumentParser(description="Pré-validação somente leitura do fluxo Excel → API mock.")
    parser.add_argument("--base-url", default="http://127.0.0.1:4100")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    try:
        report = run_preflight(ReadOnlyMockClient(args.base_url))
    except (FlowError, ValueError) as error:
        print(json.dumps({"mode": "SIMULATION_DRY_RUN", "status": "BLOCKED", "databaseWritePerformed": False, "error": str(error)}, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    sys.exit(main())
