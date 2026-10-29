import unittest

from protheus_mock_flow import FlowError, ReadOnlyMockClient, run_preflight


class FakeClient:
    def __init__(self, reports=None):
        self.reports = reports or {}
        self.counts = {}

    def health(self):
        return {"simulation": True, "readOnly": True, "connectsToProtheus": False, "writesToApplication": False}

    def records(self, entity):
        records = self.reports.get(entity, [])
        self.counts[entity] = len(records)
        yield from records


class MockFlowTests(unittest.TestCase):
    def test_preflight_reports_blockers_without_writes_or_defaults(self):
        client = FakeClient({
            "products": [{"productCode": "P1", "description": "Produto", "type": "MP", "unit": "PC", "groupCode": "G1"}],
            "product-groups": [{"groupCode": "G1", "description": "Grupo"}],
            "resources": [{"branch": 101, "resourceCode": "R1", "resourceName": "Recurso 1", "productionLineRaw": None, "workCenterRaw": None}],
            "structures": [{"parentProductCode": "P1", "componentCode": "P2", "quantity": 2, "unit": "PC", "revisionStart": "A", "revisionEnd": "B"}],
            "routings": [{"branch": 1, "resource": "R1", "productCode": "P1", "routingCode": "01", "operationSequence": "10", "operationDescription": "Montagem", "standardTimeRaw": 0.5}],
            "production-orders": [{"sourceCompositeKey": "OP1", "productCode": "P1", "plannedQuantity": 10, "producedQuantity": 0, "scrapQuantity": None, "sourceBalance": None}],
            "commitments": [{"productionOrder": "OP-MISSING", "productCode": "P2"}],
            "sales-order-headers": [{"branch": 1, "orderNumber": 12, "customerCode": 7, "productCode": None}],
            "sales-order-lines": [{"branch": 1, "salesOrderItem": "01", "productCode": "P1", "unit": "PC", "orderedQuantity": 2, "deliveryDateRaw": "2025-01-20", "salesOrderNumber": None}],
            "appointments": [{"orderNumber": None, "productCode": None, "operationRaw": None, "startedAtDateRaw": "2025-05-09", "startedAtTimeRaw": "07:15", "endedAtDateRaw": "2025-05-09", "endedAtTimeRaw": "10:30", "producedQuantity": 0, "observationsRaw": "OP 10001"}],
        })
        report = run_preflight(client)
        self.assertEqual(report["status"], "BLOCKED")
        self.assertFalse(report["databaseWritePerformed"])
        self.assertEqual(report["checks"]["structureProductReferences"]["componentsMissingFromProductCatalog"], 1)
        self.assertEqual(report["checks"]["commitmentReferences"]["ordersMissingFromProductionOrderReport"], 1)
        self.assertEqual(report["checks"]["routingResourceReferences"]["matchingCodeButBranchMismatch"], 1)
        self.assertEqual(report["checks"]["routingResourceReferences"]["routeProductsWithVerifiedResource"], 0)
        self.assertTrue(any("SH1" in blocker for blocker in report["blockers"]))
        self.assertEqual(report["datasets"]["salesOrderLinesSC6"]["rows"], 1)
        self.assertFalse(report["datasets"]["salesOrderLinesSC6"]["parentOrderKeyAvailable"])
        self.assertEqual(report["checks"]["salesOrderLineReferences"]["productsMissingFromProductCatalog"], 0)
        self.assertEqual(report["datasets"]["appointmentsSH6"]["rowsLinkableByOrderAndOperation"], 0)
        self.assertTrue(any("observações" in blocker for blocker in report["blockers"]))
        self.assertTrue(any("SC6" in blocker for blocker in report["blockers"]))
        self.assertTrue(any("C6_NUM" in blocker for blocker in report["blockers"]))
        self.assertTrue(any("saldo" in blocker.lower() for blocker in report["blockers"]))

    def test_mock_client_refuses_non_loopback_origins(self):
        with self.assertRaises(ValueError):
            ReadOnlyMockClient("https://erp.example.com")

    def test_connection_failure_is_reported_as_a_block(self):
        client = ReadOnlyMockClient("http://127.0.0.1:1", timeout=0.1, retries=0)
        with self.assertRaises(FlowError):
            client.health()


if __name__ == "__main__":
    unittest.main(verbosity=2)
