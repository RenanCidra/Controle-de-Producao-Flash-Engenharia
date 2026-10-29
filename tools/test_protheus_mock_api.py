"""Read-only API contract checks; source reports are never imported into the app DB."""

from __future__ import annotations

import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from pathlib import Path

from protheus_mock_api import ReportStore, make_handler


DATA_DIR = os.environ.get("PROTHEUS_MOCK_DATA_DIR")


@unittest.skipUnless(DATA_DIR, "Defina PROTHEUS_MOCK_DATA_DIR para testar com os relatórios locais.")
class MockProtheusApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = ReportStore(Path(DATA_DIR))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.store))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.store.close()

    def get_json(self, path):
        with urlopen(self.base_url + path, timeout=90) as response:
            self.assertEqual(response.headers.get_content_type(), "application/json")
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_health_identifies_simulation_and_no_writes(self):
        status, body = self.get_json("/v1/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["simulation"])
        self.assertTrue(body["readOnly"])
        self.assertFalse(body["connectsToProtheus"])
        self.assertFalse(body["writesToApplication"])

    def test_index_lists_read_only_endpoints(self):
        _, body = self.get_json("/v1")
        self.assertTrue(body["simulation"])
        self.assertTrue(body["readOnly"])
        self.assertIn("GET /v1/products", body["endpoints"])
        self.assertIn("GET /v1/resources", body["endpoints"])
        self.assertIn("GET /v1/sales-order-lines", body["endpoints"])
        self.assertIn("GET /v1/appointments", body["endpoints"])

    def test_products_are_paginated_and_keep_source_provenance(self):
        _, body = self.get_json("/v1/products?page=2&pageSize=3")
        self.assertEqual(body["page"], 2)
        self.assertEqual(body["recordsReturned"], 3)
        self.assertEqual(body["sourceRows"], 83012)
        self.assertEqual(body["sourceFile"], "produtos.xlsx")
        self.assertTrue(body["simulation"])
        self.assertTrue(body["readOnly"])
        self.assertTrue(body["records"][0]["productCode"])
        self.assertIn("groupCode", body["records"][0])

    def test_production_order_does_not_invent_missing_fields(self):
        _, body = self.get_json("/v1/production-orders?page=1&pageSize=1")
        record = body["records"][0]
        self.assertTrue(record["sourceCompositeKey"])
        self.assertIsNotNone(record["plannedQuantity"])
        self.assertIsNone(record["scrapQuantity"])
        self.assertIsNone(record["sourceBalance"])
        self.assertIsNone(record["salesOrderNumber"])

    def test_structure_keeps_revision_bounds_and_source_quantity(self):
        _, body = self.get_json("/v1/structures?page=1&pageSize=1")
        record = body["records"][0]
        self.assertTrue(record["parentProductCode"])
        self.assertTrue(record["componentCode"])
        self.assertIsNotNone(record["quantity"])
        self.assertIn("revisionStart", record)
        self.assertIn("revisionEnd", record)

    def test_routing_does_not_guess_time_unit_or_operation_code(self):
        _, body = self.get_json("/v1/routings?page=1&pageSize=1")
        record = body["records"][0]
        self.assertTrue(record["productCode"])
        self.assertTrue(record["operationSequence"])
        self.assertIn("standardTimeRaw", record)
        self.assertNotIn("standardTimeMinutes", record)
        self.assertNotIn("operationCode", record)

    def test_group_catalog_is_available(self):
        _, body = self.get_json("/v1/product-groups?page=1&pageSize=5")
        self.assertEqual(body["recordsReturned"], 5)
        self.assertTrue(body["records"][0]["groupCode"])

    def test_sh1_exposes_resource_and_sector_fields_without_guessing(self):
        _, body = self.get_json("/v1/resources?page=1&pageSize=1")
        record = body["records"][0]
        self.assertEqual(body["sourceFile"], "SH1.xlsx")
        self.assertEqual(body["sourceRows"], 23)
        self.assertEqual(record["branch"], 101)
        self.assertEqual(record["resourceCode"], "AFT-01")
        self.assertTrue(record["resourceName"])
        self.assertEqual(record["costCenter"], 4701)
        self.assertIsNone(record["productionLineRaw"])
        self.assertIsNone(record["workCenterRaw"])

    def test_appointment_report_preserves_raw_fields_and_missing_keys(self):
        _, body = self.get_json("/v1/appointments?page=1&pageSize=1")
        record = body["records"][0]
        self.assertEqual(body["sourceFile"], "apontamento de produção.xlsx")
        self.assertEqual(body["sourceRows"], 111296)
        self.assertIsNone(record["orderNumber"])
        self.assertIsNone(record["operationRaw"])
        self.assertEqual(record["producedQuantity"], 0)
        self.assertEqual(record["actualTimeRaw"], "003:15")
        self.assertIn("OP 01055101001", record["observationsRaw"])
        self.assertIsNone(record["scrapQuantity"])

    def test_sc5_is_only_exposed_as_order_headers(self):
        _, body = self.get_json("/v1/sales-order-headers?page=1&pageSize=1")
        record = body["records"][0]
        self.assertEqual(body["sourceFile"], "SC5.xlsx")
        self.assertEqual(body["sourceRows"], 22448)
        self.assertTrue(record["orderNumber"])
        self.assertTrue(record["customerCode"])
        self.assertIsNone(record["productCode"])
        self.assertIsNone(record["orderedQuantity"])
        self.assertIsNone(record["lineStatus"])

    def test_sc6_lines_are_exposed_without_inventing_the_missing_order_link(self):
        _, body = self.get_json("/v1/sales-order-lines?page=1&pageSize=1")
        record = body["records"][0]
        self.assertEqual(body["sourceFile"], "SC6.xlsx")
        self.assertEqual(body["sourceRows"], 68548)
        self.assertTrue(record["productCode"])
        self.assertEqual(record["unit"], "UN")
        self.assertEqual(record["orderedQuantity"], 5)
        self.assertIsNone(record["salesOrderNumber"])
        self.assertIn("purchaseRequestNumberRaw", record)

    def test_cursor_pagination_advances_without_repeating_rows(self):
        _, first = self.get_json("/v1/products?stream=true&pageSize=2")
        self.assertTrue(first["nextCursor"])
        _, second = self.get_json(f"/v1/products?stream=true&pageSize=2&cursor={first['nextCursor']}&probe=true")
        first_codes = {row["productCode"] for row in first["records"]}
        second_codes = {row["productCode"] for row in second["records"]}
        self.assertFalse(first_codes & second_codes)
        self.assertEqual(second["page"], 2)
        self.assertTrue(second["cursorProbeComplete"])
        self.assertIsNone(second["nextCursor"])

    def test_commitments_csv_embedded_in_excel_is_parsed(self):
        _, body = self.get_json("/v1/commitments?page=1&pageSize=2")
        self.assertEqual(body["recordsReturned"], 2)
        self.assertEqual(body["sourceRows"], 968694)
        self.assertTrue(body["records"][0]["productionOrder"])
        self.assertIn("committedQuantity", body["records"][0])

    def test_missing_business_sources_are_explicit(self):
        expected_errors = {"sales-orders": "SOURCE_LINK_KEY_MISSING"}
        for entity, expected_error in expected_errors.items():
            with self.subTest(entity=entity):
                with self.assertRaises(HTTPError) as raised:
                    urlopen(self.base_url + f"/v1/{entity}", timeout=10)
                self.assertEqual(raised.exception.code, 501)
                body = json.loads(raised.exception.read().decode("utf-8"))
                self.assertEqual(body["error"], expected_error)

    def test_mock_rejects_writes(self):
        request = Request(self.base_url + "/v1/products", data=b"{}", method="POST")
        with self.assertRaises(HTTPError) as raised:
            urlopen(request, timeout=10)
        self.assertEqual(raised.exception.code, 405)
        self.assertEqual(raised.exception.headers.get("Allow"), "GET")

    def test_invalid_pagination_is_a_client_error(self):
        with self.assertRaises(HTTPError) as raised:
            urlopen(self.base_url + "/v1/products?page=0&pageSize=3", timeout=10)
        self.assertEqual(raised.exception.code, 400)
        body = json.loads(raised.exception.read().decode("utf-8"))
        self.assertEqual(body["error"], "INVALID_PAGINATION")


if __name__ == "__main__":
    unittest.main(verbosity=2)
