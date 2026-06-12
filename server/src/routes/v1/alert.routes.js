// Alert routes — list, count, dismiss, manual run | spec: C2
const express = require('express');
const {
  listAlerts,
  getAlertCount,
  dismissAlert,
  triggerAlertsRun,
} = require('../../controllers/alert.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/', listAlerts);
router.get('/count', getAlertCount);
router.patch('/:id/dismiss', dismissAlert);
router.post('/run-now', authorize('admin'), triggerAlertsRun);

module.exports = router;
