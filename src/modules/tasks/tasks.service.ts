import { prisma } from '../../prisma/client';
import { TaskPriority, TaskStatus } from '@prisma/client';

export async function bulkCreateTasks(projectId: string, tasks: any[]) {
  try {
    let tasksCreated = 0;
    let tasksUpdated = 0;

    for (const task of tasks) {
      const priority = task.priority ? TaskPriority[task.priority.toUpperCase() as keyof typeof TaskPriority] : TaskPriority.MEDIUM;
      const status = task.status ? TaskStatus[task.status.replace(/\s+/g, '_').toUpperCase() as keyof typeof TaskStatus] : TaskStatus.NOT_STARTED;
      const dueDate = task.dueDate ? new Date(task.dueDate) : null;

      await (prisma as any).projectTask.upsert({
        where: {
          projectId_title: {
            projectId,
            title: task.title
          }
        },
        update: {
          description: task.description,
          dueDate,
          priority,
          status,
          assigneeUserId: task.assigneeUserId
        },
        create: {
          projectId,
          title: task.title,
          description: task.description,
          dueDate,
          priority,
          status,
          assigneeUserId: task.assigneeUserId
        }
      });

      // Since upsert doesn't return whether it created or updated, we can't easily track counts.
      // We can, however, assume success if no error is thrown.
    }

    return { success: true };
  } catch (error) {
    console.error("Bulk create error:", error);
    throw new Error('Failed to create or update tasks in database.');
  }
}
