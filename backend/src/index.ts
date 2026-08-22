import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import departmentRoutes from './routes/departments';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import analyticsRoutes from './routes/analytics';
import notificationRoutes from './routes/notifications';
import calendarRoutes from './routes/calendar';
import aiRoutes from './routes/ai';
import path from 'path';
import fs from 'fs';

import http from 'http';
import chatRoutes from './routes/chat';
import webhookRoutes from './routes/webhooks';
import { initSocketIO } from './lib/socket';
import { initRecurringTasksScheduler } from './services/recurringTasks';

const app = express();
const PORT = process.env.PORT || 4000;

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = http.createServer(app);
initSocketIO(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initRecurringTasksScheduler();
});

