const express = require('express');
const { predictDemand, getInsights, getReorderSuggestion, getDeadStock, getTrends, chatAssistant } = require('../../controllers/ai.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { aiChatLimiter } = require('../../middlewares/rateLimiter.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { chatSchema } = require('../../validators/ai.validator');

const router = express.Router();
router.use(protect);

router.post('/predict', predictDemand);
router.get('/insights', getInsights);
router.get('/reorder/:productId', getReorderSuggestion);
router.get('/dead-stock', getDeadStock);
router.get('/trends', getTrends);
// Validate first — reject invalid input cheaply before consuming rate-limit budget | bug SEC-005
router.post('/chat', validate(chatSchema), aiChatLimiter, chatAssistant);

module.exports = router;
