import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import logger from '../utils/logger';
import bcrypt from 'bcryptjs';

export const teamRouter = router({
  /**
   * Add team member (employee)
   */
  addMember: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        role: z.enum(['ADMIN', 'EMPLOYEE', 'VIEWER']).default('EMPLOYEE'),
        password: z.string().min(6),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only OWNER or ADMIN can add members
      if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
        throw new Error('Only owners and admins can add team members');
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: input.role,
          password: hashedPassword,
        },
      });

      logger.info('Team member added', {
        userId: user.id,
        name: user.name,
        role: user.role,
      });

      // Remove password from response
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }),

  /**
   * List team members
   */
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    const users = await prisma.user.findMany({
      where: {
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
        _count: {
          select: {
            assignedTasks: {
              where: {
                status: {
                  in: ['TODO', 'IN_PROGRESS'],
                },
              },
            },
          },
        },
      },
      orderBy: {
        role: 'asc', // OWNER first, then ADMIN, EMPLOYEE, VIEWER
      },
    });

    return users;
  }),

  /**
   * Create task for team member
   */
  createTask: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['FOLLOW_UP', 'QUOTE', 'SCHEDULE_JOB', 'CALL_CUSTOMER', 'SEND_INVOICE', 'COLLECT_PAYMENT', 'SITE_VISIT', 'OTHER']),
        assignedToId: z.string().optional(), // If not provided, stays unassigned
        leadId: z.string().optional(),
        customerId: z.string().optional(),
        invoiceId: z.string().optional(),
        dueDate: z.date().optional(),
        scheduledFor: z.date().optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const task = await prisma.task.create({
        data: {
          ...input,
          createdById: ctx.user.id,
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });

      logger.info('Task created', {
        taskId: task.id,
        title: task.title,
        assignedToId: task.assignedToId,
      });

      return task;
    }),

  /**
   * Get my tasks (tasks assigned to me)
   */
  myTasks: protectedProcedure
    .input(
      z.object({
        status: z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED']).optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        assignedToId: ctx.user.id,
      };

      if (input.status) {
        where.status = input.status;
      } else {
        // By default, show only incomplete tasks
        where.status = {
          in: ['TODO', 'IN_PROGRESS', 'WAITING'],
        };
      }

      const tasks = await prisma.task.findMany({
        where,
        orderBy: [
          { priority: 'desc' }, // URGENT first
          { dueDate: 'asc' }, // Soonest due first
        ],
        take: input.limit,
        include: {
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });

      return tasks;
    }),

  /**
   * Get all team tasks (for owners/admins to see what everyone is doing)
   */
  allTasks: protectedProcedure
    .input(
      z.object({
        status: z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED']).optional(),
        assignedToId: z.string().optional(),
        type: z.enum(['FOLLOW_UP', 'QUOTE', 'SCHEDULE_JOB', 'CALL_CUSTOMER', 'SEND_INVOICE', 'COLLECT_PAYMENT', 'SITE_VISIT', 'OTHER']).optional(),
        limit: z.number().min(1).max(100).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {};

      if (input.status) {
        where.status = input.status;
      } else {
        // By default, show only incomplete tasks
        where.status = {
          in: ['TODO', 'IN_PROGRESS', 'WAITING'],
        };
      }

      if (input.assignedToId) {
        where.assignedToId = input.assignedToId;
      }

      if (input.type) {
        where.type = input.type;
      }

      const tasks = await prisma.task.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
        ],
        take: input.limit,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });

      return tasks;
    }),

  /**
   * Update task status
   */
  updateTaskStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['TODO', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const task = await prisma.task.findUnique({
        where: { id: input.id },
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Can only update if you're the assignee, creator, or admin/owner
      if (
        task.assignedToId !== ctx.user.id &&
        task.createdById !== ctx.user.id &&
        ctx.user.role !== 'OWNER' &&
        ctx.user.role !== 'ADMIN'
      ) {
        throw new Error('Not authorized to update this task');
      }

      await prisma.task.update({
        where: { id: input.id },
        data: {
          status: input.status,
          completedAt: input.status === 'COMPLETED' ? new Date() : null,
        },
      });

      logger.info('Task status updated', {
        taskId: input.id,
        status: input.status,
      });

      return { success: true };
    }),

  /**
   * Reassign task
   */
  reassignTask: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        assignedToId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only OWNER or ADMIN can reassign
      if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
        throw new Error('Only owners and admins can reassign tasks');
      }

      await prisma.task.update({
        where: { id: input.id },
        data: {
          assignedToId: input.assignedToId,
        },
      });

      logger.info('Task reassigned', {
        taskId: input.id,
        assignedToId: input.assignedToId,
      });

      return { success: true };
    }),

  /**
   * Get team stats (for dashboard)
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [
      totalMembers,
      activeMembers,
      totalTasks,
      todoTasks,
      inProgressTasks,
      completedToday,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.task.count(),
      prisma.task.count({ where: { status: 'TODO' } }),
      prisma.task.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.task.count({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      totalMembers,
      activeMembers,
      totalTasks,
      todoTasks,
      inProgressTasks,
      completedToday,
    };
  }),

  /**
   * Get tasks that need attention (overdue, high priority, etc.)
   */
  needsAttention: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const tasks = await prisma.task.findMany({
      where: {
        status: {
          in: ['TODO', 'IN_PROGRESS'],
        },
        OR: [
          // Overdue
          {
            dueDate: {
              lt: now,
            },
          },
          // High/Urgent priority
          {
            priority: {
              in: ['HIGH', 'URGENT'],
            },
          },
          // Unassigned
          {
            assignedToId: null,
          },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
      take: 20,
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    return tasks;
  }),
});
