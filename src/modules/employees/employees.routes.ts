import { Router } from 'express';
import { EmployeesController } from './employees.controller.ts';
import { authenticateToken } from '../../middleware/auth.middleware.ts';
import { requirePermission } from '../../middleware/access-control.ts';
import { allowBodyFields } from '../../middleware/request-protection.ts';

const router = Router();

router.use(authenticateToken);

router.get('/', requirePermission('employees:read'), EmployeesController.list);
router.get('/eligible-users', requirePermission('employees:read'), EmployeesController.getEligibleUsers);
router.get('/:id', requirePermission('employees:read'), EmployeesController.getById);

router.post(
  '/',
  requirePermission('employees:manage'),
  allowBodyFields('name', 'employeeCode', 'department', 'status', 'linkedUserId'),
  EmployeesController.create
);

router.put(
  '/:id',
  requirePermission('employees:manage'),
  allowBodyFields('name', 'employeeCode', 'department', 'status', 'linkedUserId'),
  EmployeesController.update
);

router.delete('/:id', requirePermission('employees:manage'), EmployeesController.delete);

export default router;
