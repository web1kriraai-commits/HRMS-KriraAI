import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getAuditLogs } from '../controllers/auditController.js';

const router = express.Router();

router.get('/', authenticate, authorize('HR', 'Admin'), getAuditLogs);

export default router;



