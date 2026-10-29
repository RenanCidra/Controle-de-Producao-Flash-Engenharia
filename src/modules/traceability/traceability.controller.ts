import { Request, Response } from 'express';
import { TraceabilityService } from './traceability.service.ts';
import { TraceabilityFilterParams } from './traceability.types.ts';

export class TraceabilityController {
  public static async getMatrix(req: Request, res: Response): Promise<void> {
    try {
      const filters: TraceabilityFilterParams = {
        search: req.query.search ? String(req.query.search) : undefined,
        numeroPv: req.query.numeroPv ? String(req.query.numeroPv) : undefined,
        numeroOp: req.query.numeroOp ? String(req.query.numeroOp) : undefined,
        cliente: req.query.cliente ? String(req.query.cliente) : undefined,
        codigoProduto: req.query.codigoProduto ? String(req.query.codigoProduto) : undefined,
        statusOp: req.query.statusOp ? String(req.query.statusOp) : undefined,
        statusPv: req.query.statusPv ? String(req.query.statusPv) : undefined,
        postoTrabalho: req.query.postoTrabalho ? String(req.query.postoTrabalho) : undefined,
        apenasAtrasadas: req.query.apenasAtrasadas === 'true',
        apenasComRefugo: req.query.apenasComRefugo === 'true',
        semVinculoPv: req.query.semVinculoPv === 'true',
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 25,
      };

      const result = await TraceabilityService.getMatrix(filters);
      res.json(result);
    } catch (error: any) {
      console.error('Erro ao consultar matriz de rastreabilidade:', error);
      res.status(500).json({ error: error.message || 'Falha ao processar matriz de rastreabilidade' });
    }
  }

  public static async getOpDetail(req: Request, res: Response): Promise<void> {
    try {
      const { numeroOp } = req.params;
      const detail = await TraceabilityService.getOpDetail(numeroOp);

      if (!detail) {
        res.status(404).json({ error: `Ordem de Produção "${numeroOp}" não encontrada no Protheus.` });
        return;
      }

      res.json(detail);
    } catch (error: any) {
      console.error('Erro ao detalhar rastreabilidade da OP:', error);
      res.status(500).json({ error: error.message || 'Falha ao obter detalhe da OP' });
    }
  }

  public static async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await TraceabilityService.getMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error('Erro ao obter métricas de rastreabilidade:', error);
      res.status(500).json({ error: error.message || 'Falha ao obter métricas da produção' });
    }
  }

  public static async exportCsv(req: Request, res: Response): Promise<void> {
    try {
      const filters: TraceabilityFilterParams = {
        search: req.query.search ? String(req.query.search) : undefined,
        numeroPv: req.query.numeroPv ? String(req.query.numeroPv) : undefined,
        numeroOp: req.query.numeroOp ? String(req.query.numeroOp) : undefined,
        cliente: req.query.cliente ? String(req.query.cliente) : undefined,
        codigoProduto: req.query.codigoProduto ? String(req.query.codigoProduto) : undefined,
        statusOp: req.query.statusOp ? String(req.query.statusOp) : undefined,
        statusPv: req.query.statusPv ? String(req.query.statusPv) : undefined,
        postoTrabalho: req.query.postoTrabalho ? String(req.query.postoTrabalho) : undefined,
        apenasAtrasadas: req.query.apenasAtrasadas === 'true',
        apenasComRefugo: req.query.apenasComRefugo === 'true',
        semVinculoPv: req.query.semVinculoPv === 'true',
      };

      const csvData = await TraceabilityService.generateExportCsv(filters);
      const filename = `nexus_rastreabilidade_pv_op_${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csvData);
    } catch (error: any) {
      console.error('Erro ao exportar CSV de rastreabilidade:', error);
      res.status(500).json({ error: error.message || 'Falha ao exportar CSV' });
    }
  }

  public static async exportJson(req: Request, res: Response): Promise<void> {
    try {
      const filters: TraceabilityFilterParams = {
        search: req.query.search ? String(req.query.search) : undefined,
        numeroPv: req.query.numeroPv ? String(req.query.numeroPv) : undefined,
        numeroOp: req.query.numeroOp ? String(req.query.numeroOp) : undefined,
        cliente: req.query.cliente ? String(req.query.cliente) : undefined,
        codigoProduto: req.query.codigoProduto ? String(req.query.codigoProduto) : undefined,
        statusOp: req.query.statusOp ? String(req.query.statusOp) : undefined,
        statusPv: req.query.statusPv ? String(req.query.statusPv) : undefined,
        postoTrabalho: req.query.postoTrabalho ? String(req.query.postoTrabalho) : undefined,
        apenasAtrasadas: req.query.apenasAtrasadas === 'true',
        apenasComRefugo: req.query.apenasComRefugo === 'true',
        semVinculoPv: req.query.semVinculoPv === 'true',
      };

      const jsonData = await TraceabilityService.generateExportJson(filters);
      const filename = `nexus_rastreabilidade_pv_op_${new Date().toISOString().split('T')[0]}.json`;

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).json(jsonData);
    } catch (error: any) {
      console.error('Erro ao exportar JSON de rastreabilidade:', error);
      res.status(500).json({ error: error.message || 'Falha ao exportar JSON' });
    }
  }
}
