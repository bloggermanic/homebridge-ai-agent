import { Router } from 'express';
import { RuleEngine } from '../../rules/ruleEngine';
import { AccessoryRegistry } from '../../registry/accessoryRegistry';
import { activateAwayMode } from '../../rules/rules/awayModeRule';
import { Rule } from '../../core/types';

export function createAutomationRoutes(
  ruleEngine: RuleEngine,
  registry: AccessoryRegistry,
): Router {
  const router = Router();

  router.get('/rules', (_req, res) => {
    res.json(ruleEngine.getAllRules());
  });

  router.get('/rules/:id', (req, res) => {
    const rule = ruleEngine.getRule(req.params.id);
    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    res.json(rule);
  });

  router.post('/rules', (req, res) => {
    const rule = req.body as Rule;
    if (!rule.id || !rule.name) {
      res.status(400).json({ error: 'id and name are required' });
      return;
    }
    rule.source = rule.source || 'user';
    ruleEngine.registerRule(rule);
    res.status(201).json(rule);
  });

  router.put('/rules/:id', (req, res) => {
    const existing = ruleEngine.getRule(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    ruleEngine.updateRule(req.params.id, req.body);
    res.json(ruleEngine.getRule(req.params.id));
  });

  router.delete('/rules/:id', (req, res) => {
    const existing = ruleEngine.getRule(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    ruleEngine.removeRule(req.params.id);
    res.status(204).send();
  });

  router.post('/away-mode', (_req, res) => {
    activateAwayMode(registry, ruleEngine);
    res.json({ status: 'activated', message: 'Away mode light simulation started' });
  });

  return router;
}
