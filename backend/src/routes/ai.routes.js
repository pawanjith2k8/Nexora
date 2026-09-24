const express = require('express');
const router = express.Router();
const { privacyGuard } = require('../middleware/privacyGuard');
const aiCoachService = require('../services/aiCoach.service');

// Protect all AI routes with the Zero-Knowledge Privacy Guard
router.use(privacyGuard({ blockXpub: true }));

/**
 * POST /api/ai/coach/analyze
 * Explains audit score and detected privacy flags in plain language.
 * Payload MUST NOT contain private keys, seed phrases, or xpubs.
 */
router.post('/coach/analyze', async (req, res, next) => {
  try {
    const { score, grade, flags = [], summary = {}, userMessage = null } = req.body;

    if (score === undefined || score === null || typeof score !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        message: 'Must provide a numeric "score" (0-100).'
      });
    }

    const result = await aiCoachService.analyzePrivacyLeaks({
      score: Math.min(100, Math.max(0, score)),
      grade: grade || (score >= 80 ? 'GOOD' : score >= 50 ? 'MODERATE' : 'CRITICAL LEAK'),
      flags: Array.isArray(flags) ? flags : [],
      summary: typeof summary === 'object' ? summary : {},
      userMessage
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/coach/chat
 * Interactive conversation with the AI Privacy Coach.
 */
router.post('/coach/chat', async (req, res, next) => {
  try {
    const { message, score = 75, grade = 'MODERATE', flags = [], conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        message: 'Field "message" (string) is required for AI chat.'
      });
    }

    const result = await aiCoachService.analyzePrivacyLeaks({
      score,
      grade,
      flags,
      userMessage: message,
      conversationHistory
    });

    res.json({
      success: true,
      data: {
        reply: result.analysis,
        provider: result.provider,
        timestamp: result.timestamp
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
