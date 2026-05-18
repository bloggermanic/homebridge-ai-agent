import { Router } from 'express';
import { AccessoryRegistry } from '../../registry/accessoryRegistry';
import { DeviceController } from '../../control/deviceController';

export function createAccessoryRoutes(
  registry: AccessoryRegistry,
  controller: DeviceController,
): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(registry.getAll());
  });

  router.get('/:id', (req, res) => {
    const accessory = registry.getById(req.params.id);
    if (!accessory) {
      res.status(404).json({ error: 'Accessory not found' });
      return;
    }
    res.json(accessory);
  });

  router.put('/:id', async (req, res) => {
    const { characteristicType, value } = req.body;
    if (!characteristicType || value === undefined) {
      res.status(400).json({ error: 'characteristicType and value are required' });
      return;
    }

    const result = await controller.execute({
      uniqueId: req.params.id,
      characteristicType,
      value,
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  });

  router.get('/type/:type', (req, res) => {
    res.json(registry.getByType(req.params.type));
  });

  router.get('/zone/:zone', (req, res) => {
    res.json(registry.getByZone(req.params.zone));
  });

  return router;
}
