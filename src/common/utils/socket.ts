import { Server } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { prisma } from '../../prisma/client.js';

let io: Server;

export function setupSocketIO(app: FastifyInstance) {
  io = new Server(app.server, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'https://frontend.leavecode.co.in'
      ],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] New connection: ${socket.id}`);

    socket.on('join', async (userId: string) => {
      if (userId) {
        console.log(`[Socket.IO] User ${userId} joined their personal room`);
        socket.join(userId);
        console.log(`[Socket.IO] Rooms after personal join:`, Array.from(socket.rooms));

        // Join all project rooms the user is a member of
        try {
          const memberships = await (prisma as any).projectMember.findMany({
            where: { userId },
            select: { projectId: true }
          });
          
          memberships.forEach((m: any) => {
            console.log(`[Socket.IO] User ${userId} auto-joining project room: ${m.projectId}`);
            socket.join(`project_${m.projectId}`);
          });
          console.log(`[Socket.IO] Rooms after project auto-join:`, Array.from(socket.rooms));
        } catch (err) {
          console.error(`[Socket.IO] Error auto-joining project rooms for user ${userId}:`, err);
        }
      }
    });

    socket.on('join_project', (projectId: string) => {
      if (projectId) {
        console.log(`[Socket.IO] Socket ${socket.id} joined project room: ${projectId}`);
        socket.join(`project_${projectId}`);
        console.log(`[Socket.IO] Rooms after join_project:`, Array.from(socket.rooms));
      }
    });

    socket.on('send_message', (data: any) => {
      const { receiverId, projectId } = data;
      console.log('[Socket.IO] Relay send_message event', { receiverId, projectId, id: data?.id });
      if (projectId) {
        // Send to project room
        console.log('[Socket.IO] Emitting to project room', `project_${projectId}`, data?.id);
        io.to(`project_${projectId}`).emit('receive_message', data);
      } else if (receiverId) {
        // Send to specific user room
        console.log('[Socket.IO] Emitting to user room', receiverId, data?.id);
        io.to(receiverId).emit('receive_message', data);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Connection disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}

export function emitToUser(userId: string, event: string, data: any) {
  if (io) {
    console.log('[Socket.IO] emitToUser', { userId, event, id: data?.id });
    io.to(userId).emit(event, data);
  }
}

export function emitToProject(projectId: string, event: string, data: any) {
  if (io) {
    console.log('[Socket.IO] emitToProject', { projectId, event, id: data?.id });
    io.to(`project_${projectId}`).emit(event, data);
  }
}
