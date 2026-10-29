import { Request, Response } from 'express';
import { ProtheusSyncService } from './protheus-sync.service.ts';
import { ProtheusSyncRepository } from './protheus-sync.repository.ts';
import { ProtheusMockValidationService } from './protheus-mock-validation.service.ts';
import { ProtheusSyncBundle, ProtheusEntityType } from './protheus-sync.types.ts';

export class ProtheusSyncController {
  public static async validateMock(_req: Request, res: Response): Promise<void> {
    try {
      res.json(await ProtheusMockValidationService.run());
    } catch (error: any) {
      res.status(502).json({ error: error?.message || 'Não foi possível verificar a API simulada.' });
    }
  }

  public static async validateMockFlow(_req: Request, res: Response): Promise<void> {
    try {
      res.json(await ProtheusMockValidationService.runFlowCheck());
    } catch (error: any) {
      res.status(502).json({ error: error?.message || 'Não foi possível concluir a verificação dos relatórios.' });
    }
  }

  public static async previewMockData(req: Request, res: Response): Promise<void> {
    const entity = typeof req.query.entity === 'string' ? req.query.entity : '';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const pageSize = req.query.pageSize === undefined ? 10 : Number(req.query.pageSize);
    try {
      res.json(await ProtheusMockValidationService.readPage(entity, cursor, pageSize));
    } catch (error: any) {
      const message = error?.message;
      const status = message === 'MOCK_ENTITY_NOT_AVAILABLE' ? 404
        : ['MOCK_PAGE_SIZE_INVALID', 'MOCK_CURSOR_INVALID'].includes(message) ? 400
          : 502;
      const userMessage = message === 'MOCK_ENTITY_NOT_AVAILABLE' ? 'Conjunto de dados não disponível na simulação.'
        : message === 'MOCK_PAGE_SIZE_INVALID' ? 'O tamanho da página deve ficar entre 1 e 25.'
          : message === 'MOCK_CURSOR_INVALID' ? 'O cursor da página é inválido ou expirou.'
            : message || 'Não foi possível carregar a amostra da API simulada.';
      res.status(status).json({ error: userMessage });
    }
  }

  public static async syncRest(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      const userIdentifier = authUser?.loginName || authUser?.email || authUser?.uid || 'API_CONSUMER';
      let bundle: ProtheusSyncBundle = {};

      if (req.body.bundle) {
        bundle = req.body.bundle;
      } else if (Array.isArray(req.body)) {
        const entityType: ProtheusEntityType = (req.query.entityType as ProtheusEntityType) || 'PRODUCTS';
        if (entityType === 'PRODUCTS') bundle.products = req.body;
        else if (entityType === 'STRUCTURES') bundle.structures = req.body;
        else if (entityType === 'ROUTINGS') bundle.routings = req.body;
        else if (entityType === 'SALES_ORDERS') bundle.salesOrders = req.body;
        else if (entityType === 'PRODUCTION_ORDERS') bundle.productionOrders = req.body;
        else if (entityType === 'APPOINTMENTS') bundle.appointments = req.body;
        else bundle.products = req.body;
      } else {
        bundle = req.body;
      }

      const result = await ProtheusSyncService.processBundle(bundle, 'REST_API', userIdentifier);
      res.status(201).json(result);
    } catch (error: any) {
      console.error('Protheus REST sync failed:', error);
      res.status(400).json({ error: error.message || 'Falha ao sincronizar dados via API Protheus.' });
    }
  }

  public static async syncUpload(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user;
      const userIdentifier = authUser?.loginName || authUser?.email || authUser?.uid || 'FILE_UPLOADER';
      const { content, fileName, entityType } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'Conteúdo do arquivo não fornecido ou inválido.' });
        return;
      }

      const result = await ProtheusSyncService.processFileContent(
        content,
        fileName || 'upload.csv',
        entityType as ProtheusEntityType | undefined,
        userIdentifier
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error('Protheus file upload sync failed:', error);
      res.status(400).json({ error: error.message || 'Falha ao processar arquivo importado do Protheus.' });
    }
  }

  public static async getSalesOrders(req: Request, res: Response): Promise<void> {
    try {
      const { search, status, limit } = req.query;
      const data = await ProtheusSyncRepository.listSalesOrders({
        search: search as string,
        status: status as string,
        limit: limit ? parseInt(limit as string, 10) : 100,
      });
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching sales orders:', error);
      res.status(500).json({ error: 'Falha ao consultar pedidos de venda.' });
    }
  }

  public static async getSalesOrderDetail(req: Request, res: Response): Promise<void> {
    try {
      const { numeroPv } = req.params;
      const data = await ProtheusSyncRepository.getSalesOrderDetail(numeroPv);
      if (!data) {
        res.status(404).json({ error: `Pedido de Venda ${numeroPv} não localizado.` });
        return;
      }
      res.json(data);
    } catch (error: any) {
      console.error(`Error fetching PV detail ${req.params.numeroPv}:`, error);
      res.status(500).json({ error: 'Falha ao obter detalhe do pedido de venda.' });
    }
  }

  public static async getProductionOrders(req: Request, res: Response): Promise<void> {
    try {
      const { search, status, product, pv, limit } = req.query;
      const data = await ProtheusSyncRepository.listProductionOrders({
        search: search as string,
        status: status as string,
        product: product as string,
        pv: pv as string,
        limit: limit ? parseInt(limit as string, 10) : 100,
      });
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching production orders:', error);
      res.status(500).json({ error: 'Falha ao consultar ordens de produção.' });
    }
  }

  public static async getProductionOrderDetail(req: Request, res: Response): Promise<void> {
    try {
      const { numeroOp } = req.params;
      const data = await ProtheusSyncRepository.getProductionOrderDetail(numeroOp);
      if (!data) {
        res.status(404).json({ error: `Ordem de Produção ${numeroOp} não localizada.` });
        return;
      }
      res.json(data);
    } catch (error: any) {
      console.error(`Error fetching OP detail ${req.params.numeroOp}:`, error);
      res.status(500).json({ error: 'Falha ao obter detalhes e rastreabilidade da ordem de produção.' });
    }
  }

  public static async getProducts(req: Request, res: Response): Promise<void> {
    try {
      const { limit } = req.query;
      const data = await ProtheusSyncRepository.listProducts(limit ? parseInt(limit as string, 10) : 100);
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Falha ao listar produtos.' });
    }
  }

  public static async getBatches(req: Request, res: Response): Promise<void> {
    try {
      const { limit } = req.query;
      const data = await ProtheusSyncRepository.listBatches(limit ? parseInt(limit as string, 10) : 50);
      res.json(data);
    } catch (error: any) {
      console.error('Error fetching sync batches:', error);
      res.status(500).json({ error: 'Falha ao obter histórico de sincronização.' });
    }
  }

  public static async getTableData(req: Request, res: Response): Promise<void> {
    try {
      const page = Number.parseInt(String(req.query.page || '1'), 10);
      const pageSize = Number.parseInt(String(req.query.pageSize || '25'), 10);
      const data = await ProtheusSyncRepository.listNormalizedTableData({
        entity: req.params.entity,
        search: typeof req.query.search === 'string' ? req.query.search : '',
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 25,
      });
      res.json(data);
    } catch (error: any) {
      const notFound = error?.message === 'UNKNOWN_PROTHEUS_ENTITY';
      res.status(notFound ? 404 : 500).json({ error: notFound ? 'Tabela espelhada não encontrada.' : 'Falha ao consultar dados da tabela.' });
    }
  }
}
