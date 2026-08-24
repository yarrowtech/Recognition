import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

export type RealtimeEvent = { type: string; timestamp: string; data: unknown };

export class RealtimeHub {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => {
      socket.send(JSON.stringify({ type: 'system.connected', timestamp: new Date().toISOString(), data: {} }));
    });
  }

  broadcast(type: string, data: unknown) {
    const payload = JSON.stringify({ type, timestamp: new Date().toISOString(), data } satisfies RealtimeEvent);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }
}
