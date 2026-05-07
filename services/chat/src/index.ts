import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT ?? 3100);
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-secret';

const httpServer = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'chat' }));
});

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error('NO_TOKEN'));
  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET) as { sub: string };
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;
  // eslint-disable-next-line no-console
  console.warn(`[chat] connected user=${userId} socket=${socket.id}`);

  socket.on('booking:join', ({ bookingId }: { bookingId: string }) => {
    void socket.join(`booking:${bookingId}`);
  });

  socket.on('message:send', (msg: { bookingId: string; type: string; content?: string }) => {
    // TODO: persist via API (POST /v1/chat/messages), apply moderation pipeline (block phone numbers, WA links, etc.)
    io.to(`booking:${msg.bookingId}`).emit('message:new', { ...msg, senderId: userId, sentAt: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    // eslint-disable-next-line no-console
    console.warn(`[chat] disconnected ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.warn(`[chat] listening on :${PORT}`);
});
