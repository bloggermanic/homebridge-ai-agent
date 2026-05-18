import { Router } from 'express';
import { DataStore } from '../../storage/dataStore';

export function createEventRoutes(dataStore: DataStore): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const hours = parseInt(req.query.hours as string) || 1;
    const zone = req.query.zone as string | undefined;

    let events;
    if (zone) {
      events = dataStore.getZoneEvents(zone, hours);
    } else {
      events = dataStore.getEvents(hours);
    }

    res.json(events);
  });

  router.get('/device/:id', (req, res) => {
    const hours = parseInt(req.query.hours as string) || 1;
    res.json(dataStore.getDeviceEvents(req.params.id, hours));
  });

  return router;
}
