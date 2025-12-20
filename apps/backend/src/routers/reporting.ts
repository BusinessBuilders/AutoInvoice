import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import { Prisma } from '@prisma/client';

export const reportingRouter = router({
  /**
   * Get overall business overview stats
   */
  getOverview: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.InvoiceWhereInput = {};

      if (input.startDate || input.endDate) {
        where.serviceDate = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const [
        totalInvoices,
        paidInvoices,
        totalRevenue,
        paidRevenue,
        totalCustomers,
        avgInvoiceValue,
      ] = await Promise.all([
        prisma.invoice.count({ where }),
        prisma.invoice.count({
          where: { ...where, status: 'PAID' },
        }),
        prisma.invoice.aggregate({
          where,
          _sum: { total: true },
        }),
        prisma.invoice.aggregate({
          where: { ...where, status: 'PAID' },
          _sum: { total: true },
        }),
        prisma.customer.count(),
        prisma.invoice.aggregate({
          where,
          _avg: { total: true },
        }),
      ]);

      const outstandingAmount = await prisma.invoice.aggregate({
        where: {
          ...where,
          status: { in: ['SENT', 'DRAFT'] },
        },
        _sum: { total: true },
      });

      return {
        totalInvoices,
        paidInvoices,
        pendingInvoices: totalInvoices - paidInvoices,
        totalRevenue: totalRevenue._sum.total || 0,
        paidRevenue: paidRevenue._sum.total || 0,
        outstandingAmount: outstandingAmount._sum.total || 0,
        avgInvoiceValue: avgInvoiceValue._avg.total || 0,
        totalCustomers,
      };
    }),

  /**
   * Get revenue breakdown by service category
   */
  getRevenueByCategory: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.InvoiceWhereInput = {};

      if (input.startDate || input.endDate) {
        where.serviceDate = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      // Get all invoices with line items and services
      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          lineItems: {
            include: {
              service: true,
            },
          },
        },
      });

      // Group by category
      const categoryMap = new Map<string, { revenue: number; count: number; jobs: number }>();

      invoices.forEach((invoice) => {
        invoice.lineItems.forEach((item) => {
          const category = item.service?.category || 'Uncategorized';
          const current = categoryMap.get(category) || { revenue: 0, count: 0, jobs: 0 };

          categoryMap.set(category, {
            revenue: current.revenue + parseFloat(item.amount.toString()),
            count: current.count + 1,
            jobs: current.jobs,
          });
        });

        // Count unique jobs per category
        const jobCategories = new Set(
          invoice.lineItems
            .map((item) => item.service?.category || 'Uncategorized')
        );
        jobCategories.forEach((cat) => {
          const current = categoryMap.get(cat)!;
          current.jobs++;
        });
      });

      const categoryData = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        revenue: data.revenue,
        count: data.count,
        jobs: data.jobs,
        avgPerJob: data.jobs > 0 ? data.revenue / data.jobs : 0,
      }));

      return categoryData.sort((a, b) => b.revenue - a.revenue);
    }),

  /**
   * Get revenue over time (daily, weekly, monthly)
   */
  getRevenueOverTime: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        interval: z.enum(['day', 'week', 'month']).default('day'),
      })
    )
    .query(async ({ input }) => {
      const invoices = await prisma.invoice.findMany({
        where: {
          serviceDate: {
            gte: input.startDate,
            lte: input.endDate,
          },
        },
        orderBy: {
          serviceDate: 'asc',
        },
      });

      // Group by interval
      const grouped = new Map<string, { revenue: number; count: number; paid: number }>();

      invoices.forEach((invoice) => {
        const date = new Date(invoice.serviceDate);
        let key: string;

        if (input.interval === 'day') {
          key = date.toISOString().split('T')[0];
        } else if (input.interval === 'week') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        const current = grouped.get(key) || { revenue: 0, count: 0, paid: 0 };
        grouped.set(key, {
          revenue: current.revenue + parseFloat(invoice.total.toString()),
          count: current.count + 1,
          paid: current.paid + (invoice.status === 'PAID' ? parseFloat(invoice.total.toString()) : 0),
        });
      });

      return Array.from(grouped.entries())
        .map(([date, data]) => ({
          date,
          revenue: data.revenue,
          paidRevenue: data.paid,
          invoiceCount: data.count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }),

  /**
   * Get top customers by revenue
   */
  getTopCustomers: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.InvoiceWhereInput = {};

      if (input.startDate || input.endDate) {
        where.serviceDate = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          customer: true,
        },
      });

      // Group by customer
      const customerMap = new Map<string, {
        customer: any;
        revenue: number;
        paidRevenue: number;
        invoiceCount: number;
        paidCount: number;
      }>();

      invoices.forEach((invoice) => {
        const customerId = invoice.customerId;
        const current = customerMap.get(customerId) || {
          customer: invoice.customer,
          revenue: 0,
          paidRevenue: 0,
          invoiceCount: 0,
          paidCount: 0,
        };

        const total = parseFloat(invoice.total.toString());
        customerMap.set(customerId, {
          customer: invoice.customer,
          revenue: current.revenue + total,
          paidRevenue: current.paidRevenue + (invoice.status === 'PAID' ? total : 0),
          invoiceCount: current.invoiceCount + 1,
          paidCount: current.paidCount + (invoice.status === 'PAID' ? 1 : 0),
        });
      });

      return Array.from(customerMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, input.limit)
        .map((data) => ({
          customer: {
            id: data.customer.id,
            name: data.customer.name,
            email: data.customer.email,
            company: data.customer.company,
          },
          totalRevenue: data.revenue,
          paidRevenue: data.paidRevenue,
          outstandingAmount: data.revenue - data.paidRevenue,
          invoiceCount: data.invoiceCount,
          paidInvoiceCount: data.paidCount,
          avgInvoiceValue: data.invoiceCount > 0 ? data.revenue / data.invoiceCount : 0,
        }));
    }),

  /**
   * Get service performance metrics
   */
  getServicePerformance: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.InvoiceWhereInput = {};

      if (input.startDate || input.endDate) {
        where.serviceDate = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          lineItems: {
            include: {
              service: true,
            },
          },
        },
      });

      // Group by service
      const serviceMap = new Map<string, {
        service: any;
        revenue: number;
        quantity: number;
        usage: number;
      }>();

      invoices.forEach((invoice) => {
        invoice.lineItems.forEach((item) => {
          if (!item.service) return;

          const serviceId = item.serviceId!;
          const current = serviceMap.get(serviceId) || {
            service: item.service,
            revenue: 0,
            quantity: 0,
            usage: 0,
          };

          serviceMap.set(serviceId, {
            service: item.service,
            revenue: current.revenue + parseFloat(item.amount.toString()),
            quantity: current.quantity + parseFloat(item.quantity.toString()),
            usage: current.usage + 1,
          });
        });
      });

      return Array.from(serviceMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, input.limit)
        .map((data) => ({
          service: {
            id: data.service.id,
            name: data.service.name,
            code: data.service.code,
            category: data.service.category,
          },
          revenue: data.revenue,
          totalQuantity: data.quantity,
          usageCount: data.usage,
          avgRevenue: data.usage > 0 ? data.revenue / data.usage : 0,
        }));
    }),

  /**
   * Get job cost analysis
   */
  getJobCostAnalysis: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.InvoiceWhereInput = {};

      if (input.startDate || input.endDate) {
        where.serviceDate = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          lineItems: {
            include: {
              service: true,
            },
          },
          customer: true,
        },
      });

      return invoices.map((invoice) => {
        const lineItemCosts = invoice.lineItems.map((item) => ({
          service: item.service?.name || item.description,
          category: item.service?.category || 'Uncategorized',
          quantity: parseFloat(item.quantity.toString()),
          rate: parseFloat(item.rate.toString()),
          amount: parseFloat(item.amount.toString()),
        }));

        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customer: {
            id: invoice.customer.id,
            name: invoice.customer.name,
          },
          serviceDate: invoice.serviceDate,
          status: invoice.status,
          subtotal: parseFloat(invoice.subtotal.toString()),
          taxAmount: parseFloat(invoice.taxAmount.toString()),
          discount: parseFloat(invoice.discount.toString()),
          total: parseFloat(invoice.total.toString()),
          lineItems: lineItemCosts,
        };
      });
    }),

  /**
   * Get invoice status breakdown
   */
  getInvoiceStatusBreakdown: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.InvoiceWhereInput = {};

      if (input.startDate || input.endDate) {
        where.serviceDate = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const invoices = await prisma.invoice.findMany({
        where,
      });

      const statusMap = new Map<string, { count: number; revenue: number }>();

      invoices.forEach((invoice) => {
        const status = invoice.status;
        const current = statusMap.get(status) || { count: 0, revenue: 0 };

        statusMap.set(status, {
          count: current.count + 1,
          revenue: current.revenue + parseFloat(invoice.total.toString()),
        });
      });

      return Array.from(statusMap.entries()).map(([status, data]) => ({
        status,
        count: data.count,
        revenue: data.revenue,
      }));
    }),

  /**
   * Get expense overview stats
   */
  getExpenseOverview: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.ReceiptWhereInput = {};

      if (input.startDate || input.endDate) {
        where.date = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const [totalExpenses, expenseCount, avgExpenseAmount] = await Promise.all([
        prisma.receipt.aggregate({
          where,
          _sum: { amount: true },
        }),
        prisma.receipt.count({ where }),
        prisma.receipt.aggregate({
          where,
          _avg: { amount: true },
        }),
      ]);

      // Get expenses by status
      const receipts = await prisma.receipt.findMany({ where });

      const statusMap = new Map<string, { count: number; amount: number }>();
      const paymentMethodMap = new Map<string, { count: number; amount: number }>();

      receipts.forEach((receipt) => {
        const amount = parseFloat(receipt.amount.toString());

        // Group by status
        const status = receipt.status;
        const currentStatus = statusMap.get(status) || { count: 0, amount: 0 };
        statusMap.set(status, {
          count: currentStatus.count + 1,
          amount: currentStatus.amount + amount,
        });

        // Group by payment method
        const paymentMethod = receipt.paymentMethod || 'other';
        const currentPayment = paymentMethodMap.get(paymentMethod) || { count: 0, amount: 0 };
        paymentMethodMap.set(paymentMethod, {
          count: currentPayment.count + 1,
          amount: currentPayment.amount + amount,
        });
      });

      return {
        totalExpenses: totalExpenses._sum.amount || 0,
        expenseCount,
        avgExpenseAmount: avgExpenseAmount._avg.amount || 0,
        expensesByStatus: Array.from(statusMap.entries()).map(([status, data]) => ({
          status,
          count: data.count,
          amount: data.amount,
        })),
        expensesByPaymentMethod: Array.from(paymentMethodMap.entries()).map(([method, data]) => ({
          paymentMethod: method,
          count: data.count,
          amount: data.amount,
        })),
      };
    }),

  /**
   * Get expenses breakdown by category
   */
  getExpensesByCategory: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        paymentMethod: z.enum(['credit_card', 'debit_card', 'cash', 'check', 'other']).optional(),
        status: z.enum(['pending', 'processed', 'review_needed']).optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.ReceiptWhereInput = {};

      if (input.startDate || input.endDate) {
        where.date = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      if (input.paymentMethod) {
        where.paymentMethod = input.paymentMethod;
      }

      if (input.status) {
        where.status = input.status;
      }

      const receipts = await prisma.receipt.findMany({ where });

      const categoryMap = new Map<string, { amount: number; count: number }>();
      let totalExpenses = 0;

      receipts.forEach((receipt) => {
        const category = receipt.category || 'Uncategorized';
        const amount = parseFloat(receipt.amount.toString());
        const current = categoryMap.get(category) || { amount: 0, count: 0 };

        categoryMap.set(category, {
          amount: current.amount + amount,
          count: current.count + 1,
        });

        totalExpenses += amount;
      });

      const categoryData = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        totalAmount: data.amount,
        count: data.count,
        percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
        avgAmount: data.count > 0 ? data.amount / data.count : 0,
      }));

      return categoryData.sort((a, b) => b.totalAmount - a.totalAmount);
    }),

  /**
   * Get expense trends over time
   */
  getExpenseTrends: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        interval: z.enum(['day', 'week', 'month']).default('month'),
        category: z.string().optional(),
        paymentMethod: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.ReceiptWhereInput = {
        date: {
          gte: input.startDate,
          lte: input.endDate,
        },
      };

      if (input.category) {
        where.category = input.category;
      }

      if (input.paymentMethod) {
        where.paymentMethod = input.paymentMethod as any;
      }

      const receipts = await prisma.receipt.findMany({
        where,
        orderBy: { date: 'asc' },
      });

      const grouped = new Map<string, { amount: number; count: number; topCategory: Map<string, number> }>();

      receipts.forEach((receipt) => {
        const date = new Date(receipt.date);
        let key: string;

        if (input.interval === 'day') {
          key = date.toISOString().split('T')[0];
        } else if (input.interval === 'week') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        const current = grouped.get(key) || { amount: 0, count: 0, topCategory: new Map() };
        const amount = parseFloat(receipt.amount.toString());
        const category = receipt.category || 'Uncategorized';

        grouped.set(key, {
          amount: current.amount + amount,
          count: current.count + 1,
          topCategory: current.topCategory.set(category, (current.topCategory.get(category) || 0) + amount),
        });
      });

      return Array.from(grouped.entries())
        .map(([date, data]) => {
          const topCategoryEntry = Array.from(data.topCategory.entries())
            .sort((a, b) => b[1] - a[1])[0];

          return {
            date,
            totalExpenses: data.amount,
            receiptCount: data.count,
            topCategory: topCategoryEntry ? topCategoryEntry[0] : 'None',
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    }),

  /**
   * Get profit analysis (revenue - expenses)
   */
  getProfitAnalysis: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        groupBy: z.enum(['category', 'customer', 'month']).default('category'),
      })
    )
    .query(async ({ input }) => {
      const invoiceWhere: Prisma.InvoiceWhereInput = {};
      const receiptWhere: Prisma.ReceiptWhereInput = {};

      if (input.startDate || input.endDate) {
        invoiceWhere.serviceDate = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
        receiptWhere.date = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const [invoices, receipts] = await Promise.all([
        prisma.invoice.findMany({
          where: invoiceWhere,
          include: {
            lineItems: { include: { service: true } },
            customer: true,
          },
        }),
        prisma.receipt.findMany({ where: receiptWhere }),
      ]);

      // Calculate overhead (receipts not linked to invoices)
      const linkedReceiptIds = new Set(receipts.filter(r => r.invoiceId).map(r => r.id));
      const overheadExpenses = receipts
        .filter(r => !r.invoiceId)
        .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

      if (input.groupBy === 'category') {
        const categoryMap = new Map<string, { revenue: number; directCosts: number }>();

        invoices.forEach((invoice) => {
          invoice.lineItems.forEach((item) => {
            const category = item.service?.category || 'Uncategorized';
            const current = categoryMap.get(category) || { revenue: 0, directCosts: 0 };
            categoryMap.set(category, {
              revenue: current.revenue + parseFloat(item.amount.toString()),
              directCosts: current.directCosts,
            });
          });

          // Add linked receipt costs
          const linkedReceipts = receipts.filter(r => r.invoiceId === invoice.id);
          linkedReceipts.forEach((receipt) => {
            const category = receipt.category || 'Uncategorized';
            const current = categoryMap.get(category) || { revenue: 0, directCosts: 0 };
            categoryMap.set(category, {
              revenue: current.revenue,
              directCosts: current.directCosts + parseFloat(receipt.amount.toString()),
            });
          });
        });

        const results = Array.from(categoryMap.entries()).map(([category, data]) => ({
          groupKey: category,
          revenue: data.revenue,
          directCosts: data.directCosts,
          profit: data.revenue - data.directCosts,
          profitMargin: data.revenue > 0 ? ((data.revenue - data.directCosts) / data.revenue) * 100 : 0,
        }));

        return {
          data: results.sort((a, b) => b.profit - a.profit),
          overheadCosts: overheadExpenses,
        };
      } else if (input.groupBy === 'customer') {
        const customerMap = new Map<string, { name: string; revenue: number; directCosts: number }>();

        invoices.forEach((invoice) => {
          const customerId = invoice.customerId;
          const current = customerMap.get(customerId) || {
            name: invoice.customer.name,
            revenue: 0,
            directCosts: 0,
          };

          const invoiceRevenue = parseFloat(invoice.total.toString());
          const linkedReceipts = receipts.filter(r => r.invoiceId === invoice.id);
          const linkedCosts = linkedReceipts.reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

          customerMap.set(customerId, {
            name: current.name,
            revenue: current.revenue + invoiceRevenue,
            directCosts: current.directCosts + linkedCosts,
          });
        });

        const results = Array.from(customerMap.entries()).map(([_, data]) => ({
          groupKey: data.name,
          revenue: data.revenue,
          directCosts: data.directCosts,
          profit: data.revenue - data.directCosts,
          profitMargin: data.revenue > 0 ? ((data.revenue - data.directCosts) / data.revenue) * 100 : 0,
        }));

        return {
          data: results.sort((a, b) => b.profit - a.profit),
          overheadCosts: overheadExpenses,
        };
      } else {
        // Group by month
        const monthMap = new Map<string, { revenue: number; directCosts: number }>();

        invoices.forEach((invoice) => {
          const date = new Date(invoice.serviceDate);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const current = monthMap.get(monthKey) || { revenue: 0, directCosts: 0 };

          const invoiceRevenue = parseFloat(invoice.total.toString());
          const linkedReceipts = receipts.filter(r => r.invoiceId === invoice.id);
          const linkedCosts = linkedReceipts.reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

          monthMap.set(monthKey, {
            revenue: current.revenue + invoiceRevenue,
            directCosts: current.directCosts + linkedCosts,
          });
        });

        const results = Array.from(monthMap.entries()).map(([month, data]) => ({
          groupKey: month,
          revenue: data.revenue,
          directCosts: data.directCosts,
          profit: data.revenue - data.directCosts,
          profitMargin: data.revenue > 0 ? ((data.revenue - data.directCosts) / data.revenue) * 100 : 0,
        }));

        return {
          data: results.sort((a, b) => a.groupKey.localeCompare(b.groupKey)),
          overheadCosts: overheadExpenses,
        };
      }
    }),

  /**
   * Get tax preparation report
   */
  getTaxReport: protectedProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ input }) => {
      const receipts = await prisma.receipt.findMany({
        where: {
          date: {
            gte: input.startDate,
            lte: input.endDate,
          },
        },
      });

      // Tax category mapping
      const taxCategories: Record<string, string[]> = {
        'Meals & Entertainment': ['restaurant', 'coffee shop', 'fast food', 'bar', 'catering'],
        'Travel': ['hotel', 'airbnb', 'flight', 'car rental', 'taxi', 'uber', 'lyft'],
        'Office Supplies': ['office supply', 'amazon', 'staples', 'office depot'],
        'Software & Technology': ['software', 'saas', 'subscription', 'technology', 'hosting'],
        'Vehicle & Transportation': ['gas', 'fuel', 'parking', 'toll', 'vehicle'],
        'Utilities': ['utilities', 'internet', 'phone', 'electricity', 'water'],
        'Professional Services': ['consulting', 'legal', 'accounting', 'professional'],
        'Other Deductible': [],
      };

      const taxCategoryMap = new Map<string, {
        totalAmount: number;
        receiptCount: number;
        receiptsWithoutNotes: number;
        paymentMethods: Map<string, number>;
      }>();

      receipts.forEach((receipt) => {
        const category = receipt.category?.toLowerCase() || '';
        let taxCategory = 'Other Deductible';

        // Find matching tax category
        for (const [taxCat, keywords] of Object.entries(taxCategories)) {
          if (keywords.some(keyword => category.includes(keyword.toLowerCase()))) {
            taxCategory = taxCat;
            break;
          }
        }

        const current = taxCategoryMap.get(taxCategory) || {
          totalAmount: 0,
          receiptCount: 0,
          receiptsWithoutNotes: 0,
          paymentMethods: new Map(),
        };

        const amount = parseFloat(receipt.amount.toString());
        const paymentMethod = receipt.paymentMethod || 'other';

        taxCategoryMap.set(taxCategory, {
          totalAmount: current.totalAmount + amount,
          receiptCount: current.receiptCount + 1,
          receiptsWithoutNotes: current.receiptsWithoutNotes + (!receipt.notes || receipt.notes.trim() === '' ? 1 : 0),
          paymentMethods: current.paymentMethods.set(
            paymentMethod,
            (current.paymentMethods.get(paymentMethod) || 0) + amount
          ),
        });
      });

      return Array.from(taxCategoryMap.entries()).map(([taxCategory, data]) => ({
        taxCategory,
        totalAmount: data.totalAmount,
        receiptCount: data.receiptCount,
        receiptsWithoutNotes: data.receiptsWithoutNotes,
        paymentMethodBreakdown: Array.from(data.paymentMethods.entries()).map(([method, amount]) => ({
          paymentMethod: method,
          amount,
        })),
      }));
    }),

  /**
   * Get top vendors by expense amount
   */
  getTopVendors: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const where: Prisma.ReceiptWhereInput = {};

      if (input.startDate || input.endDate) {
        where.date = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      const receipts = await prisma.receipt.findMany({ where });

      const vendorMap = new Map<string, {
        totalSpent: number;
        receiptCount: number;
        categories: Map<string, number>;
      }>();

      receipts.forEach((receipt) => {
        const vendor = receipt.vendor || 'Unknown';
        const amount = parseFloat(receipt.amount.toString());
        const category = receipt.category || 'Uncategorized';

        const current = vendorMap.get(vendor) || {
          totalSpent: 0,
          receiptCount: 0,
          categories: new Map(),
        };

        vendorMap.set(vendor, {
          totalSpent: current.totalSpent + amount,
          receiptCount: current.receiptCount + 1,
          categories: current.categories.set(
            category,
            (current.categories.get(category) || 0) + amount
          ),
        });
      });

      const vendorData = Array.from(vendorMap.entries())
        .map(([vendor, data]) => {
          const topCategoryEntry = Array.from(data.categories.entries())
            .sort((a, b) => b[1] - a[1])[0];

          return {
            vendor,
            totalSpent: data.totalSpent,
            receiptCount: data.receiptCount,
            mostCommonCategory: topCategoryEntry ? topCategoryEntry[0] : 'None',
            avgExpenseAmount: data.receiptCount > 0 ? data.totalSpent / data.receiptCount : 0,
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, input.limit);

      return vendorData;
    }),
});
