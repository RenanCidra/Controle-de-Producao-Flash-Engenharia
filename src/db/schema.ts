import { relations, sql } from "drizzle-orm";
import { check, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Organizations own accounts, employee records, and operational data.
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tradeName: text("trade_name"),
  taxId: text("tax_id"),
  plantCode: text("plant_code"),
  email: text("email"),
  phone: text("phone"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Employees are management records; they do not authenticate into the system.
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  employeeCode: text("employee_code"),
  name: text("name").notNull(),
  department: text("department"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [uniqueIndex("employees_org_code_unique").on(table.organizationId, table.employeeCode)]);

// System accounts authenticate and receive roles; email is optional contact data.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  loginName: text("login_name").notNull().unique(),
  email: text("email").unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("OPERATOR"),
  status: text("status").notNull().default("ACTIVE"),
  department: text("department"),
  avatarUrl: text("avatar_url"),
  employeeId: integer("employee_id").references(() => employees.id, { onDelete: "set null" }),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Access tokens are revocable per browser/device. Only a hash of the random JWT jti is stored.
export const authSessions = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionHash: text("session_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  uniqueIndex("auth_sessions_hash_unique").on(table.sessionHash),
  index("auth_sessions_user_expiry_idx").on(table.userId, table.expiresAt),
]);

// 3. Raw Materials & Finished Goods Inventory (Insumos e Produtos Acabados)
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  itemType: text("item_type").notNull().default("RAW_MATERIAL"),
  unit: text("unit").notNull().default("UN"),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull().default("0.00"),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 4. Production Lines & Workstations (Linhas de Produção e Postos de Trabalho)
export const productionLines = pgTable("production_lines", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  capacityPerHour: integer("capacity_per_hour").notNull().default(0),
  status: text("status").notNull().default("OPERATIONAL"),
  supervisorName: text("supervisor_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 5. Production Orders (Ordens de Produção Locais)
export const productionOrders = pgTable("production_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  inventoryItemId: integer("inventory_item_id")
    .references(() => inventoryItems.id)
    .notNull(),
  productionLineId: integer("production_line_id").references(() => productionLines.id),
  quantityPlanned: integer("quantity_planned").notNull(),
  quantityProduced: integer("quantity_produced").notNull().default(0),
  quantityScrap: integer("quantity_scrap").notNull().default(0),
  status: text("status").notNull().default("PLANNED"),
  priority: text("priority").notNull().default("NORMAL"),
  startDate: text("start_date"),
  plannedEndDate: text("planned_end_date").notNull(),
  completedDate: text("completed_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 6. Quality Control & Inspections (Controle de Qualidade)
export const qualityInspections = pgTable("quality_inspections", {
  id: serial("id").primaryKey(),
  productionOrderId: integer("production_order_id")
    .references(() => productionOrders.id)
    .notNull(),
  batchNumber: text("batch_number").notNull(),
  sampleSize: integer("sample_size").notNull().default(1),
  approvedCount: integer("approved_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  status: text("status").notNull().default("PASSED"),
  inspectorName: text("inspector_name").notNull(),
  notes: text("notes"),
  inspectedAt: timestamp("inspected_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// 7. Third-Party Integrations
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  baseUrl: text("base_url"),
  apiKey: text("api_key"),
  authType: text("auth_type").notNull().default("BEARER"),
  headerName: text("header_name"),
  status: text("status").notNull().default("CONFIGURED"),
  lastSyncAt: timestamp("last_sync_at"),
  lastStatusMessage: text("last_status_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 8. Detailed Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  status: text("status").notNull().default("SUCCESS"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==========================================
// TOTVS PROTHEUS NORMALIZED CORE MODULE (Módulo 1)
// ==========================================

export const protheusImportBatches = pgTable("protheus_import_batches", {
  id: serial("id").primaryKey(),
  batchCode: text("batch_code").notNull().unique(),
  sourceType: text("source_type").notNull(),
  entityType: text("entity_type").notNull(),
  recordsCount: integer("records_count").notNull().default(0),
  status: text("status").notNull().default("PROCESSED"),
  summary: text("summary"),
  importedBy: text("imported_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const protheusProducts = pgTable("protheus_products", {
  id: serial("id").primaryKey(),
  codigoProduto: text("codigo_produto").notNull().unique(), // SB1: B1_COD
  descricao: text("descricao").notNull(), // SB1: B1_DESC
  tipo: text("tipo").notNull(), // SB1: B1_TIPO (PA, PI, MP, etc.)
  unidadeMedida: text("unidade_medida").notNull(), // SB1: B1_UM
  revisao: text("revisao"), // SB1: B1_REV
  armazemPadrao: text("armazem_padrao"), // SB1: B1_LOCPAD
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const protheusProductStructures = pgTable("protheus_product_structures", {
  id: serial("id").primaryKey(),
  codigoProdutoPai: text("codigo_produto_pai").notNull(), // SG1: G1_COD
  codigoComponente: text("codigo_componente").notNull(), // SG1: G1_COMP
  descricaoComponente: text("descricao_componente"),
  quantidadeNecessaria: numeric("quantidade_necessaria").notNull(), // SG1: G1_QUANT
  unidadeComponente: text("unidade_componente").notNull(),
  perdaPercentual: numeric("perda_percentual"), // SG1: G1_PERDA
  revisao: text("revisao"), // SG1: G1_REVINI / G1_REVFIM
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const protheusRoutings = pgTable("protheus_routings", {
  id: serial("id").primaryKey(),
  codigoProduto: text("codigo_produto").notNull(), // SG2: G2_PRODUTO
  codigoRoteiro: text("codigo_roteiro").notNull(), // SG2: G2_ROTEIRO
  sequenciaOperacao: text("sequencia_operacao").notNull(), // SG2: G2_OPERAC
  codigoOperacao: text("codigo_operacao").notNull(), // SG2: G2_CODIGO
  descricaoOperacao: text("descricao_operacao").notNull(), // SG2: G2_DESC
  postoTrabalho: text("posto_trabalho"), // SG2: G2_RECURSO / G2_POSTO
  tempoPadraoMinutos: numeric("tempo_padrao_minutos"), // SG2: G2_TEMPO
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const protheusSalesOrders = pgTable("protheus_sales_orders", {
  id: serial("id").primaryKey(),
  numeroPv: text("numero_pv").notNull(), // SC5: C5_NUM
  itemPv: text("item_pv").notNull(), // SC6: C6_ITEM
  clienteCodigo: text("cliente_codigo"), // SC5: C5_CLIENTE
  clienteNome: text("cliente_nome").notNull(), // SA1: A1_NOME
  clienteCnpj: text("cliente_cnpj"), // SA1: A1_CGC
  codigoProduto: text("codigo_produto").notNull(), // SC6: C6_PRODUTO
  descricaoProduto: text("descricao_produto"), // SC6: C6_DESCRI
  quantidadePedida: numeric("quantidade_pedida").notNull(), // SC6: C6_QTDVEN
  quantidadeEntregue: numeric("quantidade_entregue").notNull().default("0"), // SC6: C6_QTDENT
  unidadeMedida: text("unidade_medida").notNull(), // SC6: C6_UM
  dataEmissao: text("data_emissao").notNull(), // SC5: C5_EMISSAO
  dataEntrega: text("data_entrega").notNull(), // SC6: C6_ENTREG
  statusProtheus: text("status_protheus").notNull(), // SC6: C6_BLQ / Status
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const protheusProductionOrders = pgTable("protheus_production_orders", {
  id: serial("id").primaryKey(),
  numeroOp: text("numero_op").notNull().unique(), // SC2: C2_NUM + C2_ITEM + C2_SEQUEN
  codigoProduto: text("codigo_produto").notNull(), // SC2: C2_PRODUTO
  descricaoProduto: text("descricao_produto"),
  numeroPv: text("numero_pv"), // SC2: C2_PEDIDO
  itemPv: text("item_pv"), // SC2: C2_ITEMPV
  codigoRoteiro: text("codigo_roteiro"), // SC2: C2_ROTEIRO
  quantidadePlanejada: numeric("quantidade_planejada").notNull(), // SC2: C2_QUANT
  quantidadeProduzida: numeric("quantidade_produzida").notNull().default("0"), // SC2: C2_QUJE
  quantidadeRefugo: numeric("quantidade_refugo").notNull().default("0"), // SC2: C2_PERDA
  saldoAProduzir: numeric("saldo_a_produzir").notNull(), // SC2: C2_SALDO
  statusProtheus: text("status_protheus").notNull(), // SC2: C2_STATUS
  etapaAtual: text("etapa_atual"),
  dataEmissao: text("data_emissao").notNull(), // SC2: C2_EMISSAO
  dataInicioReal: text("data_inicio_real"), // SC2: C2_DATRF
  dataPrevisaoFim: text("data_previsao_fim").notNull(), // SC2: C2_DATPRF
  dataConclusaoReal: text("data_conclusao_real"), // SC2: C2_DATPRI
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const protheusProductionAppointments = pgTable("protheus_production_appointments", {
  id: serial("id").primaryKey(),
  numeroOp: text("numero_op").notNull(), // SH6: H6_OP
  sequenciaOperacao: text("sequencia_operacao").notNull(), // SH6: H6_OPERAC
  codigoOperacao: text("codigo_operacao"),
  descricaoOperacao: text("descricao_operacao"),
  postoTrabalho: text("posto_trabalho"), // SH6: H6_RECURSO
  operador: text("operador"), // SH6: H6_OPERADO
  quantidadeProduzida: numeric("quantidade_produzida").notNull(), // SH6: H6_QTDPROD
  quantidadeRefugo: numeric("quantidade_refugo").notNull().default("0"), // SH6: H6_QTDPERD
  dataApontamento: text("data_apontamento").notNull(), // SH6: H6_DTAPONT
  horaInicio: text("hora_inicio"), // SH6: H6_HORAINI
  horaFim: text("hora_fim"), // SH6: H6_HORAFIN
  tipoApontamento: text("tipo_apontamento").notNull(), // SH6: H6_TIPO
  motivoRefugo: text("motivo_refugo"), // SH6: H6_MOTIVO
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// SH1 resource master mirror. Raw fields retain source units when interpretation is not confirmed.
export const protheusResources = pgTable("protheus_resources", {
  id: serial("id").primaryKey(),
  branch: text("branch").notNull(),
  resourceCode: text("resource_code").notNull(),
  resourceName: text("resource_name").notNull(),
  productionLineRaw: text("production_line_raw"),
  laborEfficiencyRaw: text("labor_efficiency_raw"),
  costCenter: text("cost_center"),
  lastMaintenanceRaw: text("last_maintenance_raw"),
  maintenanceIntervalRaw: text("maintenance_interval_raw"),
  utilizationIndexRaw: text("utilization_index_raw"),
  workCenterRaw: text("work_center_raw"),
  calendarRaw: text("calendar_raw"),
  unlimitedResourceFlagRaw: text("unlimited_resource_flag_raw"),
  costCenterGroupRaw: text("cost_center_group_raw"),
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [uniqueIndex("protheus_resources_branch_code_uidx").on(table.branch, table.resourceCode)]);

// Commitment mirror. sourceKey is built only from source identity columns, never from inferred relationships.
export const protheusCommitments = pgTable("protheus_commitments", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  branch: text("branch").notNull(),
  productCode: text("product_code").notNull(),
  description: text("description"),
  productionOrder: text("production_order").notNull(),
  warehouse: text("warehouse"),
  commitmentDateRaw: text("commitment_date_raw"),
  suspendedQuantity: numeric("suspended_quantity"),
  sourceSituation: text("source_situation"),
  committedQuantity: numeric("committed_quantity"),
  commitmentBalance: numeric("commitment_balance"),
  valueClass: text("value_class"),
  structureSequence: text("structure_sequence"),
  lot: text("lot"),
  subLot: text("sub_lot"),
  expirationDateRaw: text("expiration_date_raw"),
  originOrder: text("origin_order"),
  alternateUnitBalance: numeric("alternate_unit_balance"),
  maintenanceOrder: text("maintenance_order"),
  sourceSequence: text("source_sequence"),
  lotPower: text("lot_power"),
  processQuantity: numeric("process_quantity"),
  parentProductCode: text("parent_product_code"),
  routingCode: text("routing_code"),
  operation: text("operation"),
  phantom: text("phantom"),
  observation: text("observation"),
  createdByName: text("created_by_name"),
  createdByCode: text("created_by_code"),
  batchId: integer("batch_id").references(() => protheusImportBatches.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [uniqueIndex("protheus_commitments_source_key_uidx").on(table.sourceKey)]);

// User-entered operational occurrences are linked to, but never written back to, Protheus.
export const productionOccurrences = pgTable("production_occurrences", {
  id: serial("id").primaryKey(),
  numeroOp: text("numero_op").notNull().references(() => protheusProductionOrders.numeroOp),
  occurrenceType: text("occurrence_type").notNull(),
  description: text("description").notNull(),
  operation: text("operation"),
  workstation: text("workstation"),
  immediateAction: text("immediate_action"),
  status: text("status").notNull().default("OPEN"),
  createdByUid: text("created_by_uid").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("production_occurrences_op_idx").on(table.numeroOp, table.createdAt),
  index("production_occurrences_status_idx").on(table.status, table.createdAt),
  check("production_occurrences_status_check", sql`${table.status} IN ('OPEN', 'IN_PROGRESS', 'CLOSED')`),
]);

// Follow-up notes and status changes are append-only to preserve the occurrence history.
export const productionOccurrenceEvents = pgTable("production_occurrence_events", {
  id: serial("id").primaryKey(),
  occurrenceId: integer("occurrence_id").notNull().references(() => productionOccurrences.id),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  authorUid: text("author_uid").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("production_occurrence_events_occurrence_idx").on(table.occurrenceId, table.createdAt),
  check("production_occurrence_events_type_check", sql`${table.eventType} IN ('CREATED', 'NOTE', 'STATUS_CHANGED')`),
]);

// Relations
export const productionOrdersRelations = relations(productionOrders, ({ one, many }) => ({
  item: one(inventoryItems, {
    fields: [productionOrders.inventoryItemId],
    references: [inventoryItems.id],
  }),
  line: one(productionLines, {
    fields: [productionOrders.productionLineId],
    references: [productionLines.id],
  }),
  inspections: many(qualityInspections),
}));

export const qualityInspectionsRelations = relations(qualityInspections, ({ one }) => ({
  order: one(productionOrders, {
    fields: [qualityInspections.productionOrderId],
    references: [productionOrders.id],
  }),
}));

