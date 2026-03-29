import { prisma } from '../../prisma/client.js';
import { TaskPriority, TaskStatus } from '@prisma/client';

export async function bulkCreateTasks(projectId: string, tasks: any[]) {
  try {
    let tasksCreated = 0;
    let tasksUpdated = 0;

    for (const task of tasks) {
      if (!task.title || typeof task.title !== 'string' || task.title.trim() === '') {
        console.warn('Skipping task with empty title');
        continue;
      }

      let priority: TaskPriority = TaskPriority.MEDIUM;
      if (task.priority) {
        const p = task.priority.toUpperCase();
        if (p in TaskPriority) {
          priority = TaskPriority[p as keyof typeof TaskPriority];
        }
      }

      let status: TaskStatus = TaskStatus.NOT_STARTED;
      if (task.status) {
        const s = task.status.replace(/\s+/g, '_').toUpperCase();
        if (s in TaskStatus) {
          status = TaskStatus[s as keyof typeof TaskStatus];
        }
      }

      let dueDate: Date | null = null;
      if (task.dueDate) {
        const d = new Date(task.dueDate);
        if (!isNaN(d.getTime())) {
          dueDate = d;
        } else {
          console.warn(`Invalid dueDate for task "${task.title}": ${task.dueDate}`);
        }
      }

      await (prisma as any).projectTask.upsert({
        where: {
          projectId_title: {
            projectId,
            title: task.title.trim()
          }
        },
        update: {
          description: task.description || null,
          dueDate,
          priority,
          status,
          assigneeUserId: task.assigneeUserId || null
        },
        create: {
          projectId,
          title: task.title.trim(),
          description: task.description || null,
          dueDate,
          priority,
          status,
          assigneeUserId: task.assigneeUserId || null
        }
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Bulk create error details:", {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    throw new Error(`Failed to create or update tasks: ${error.message}`);
  }
}
