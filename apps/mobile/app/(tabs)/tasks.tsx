import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { format } from 'date-fns';

export default function TasksScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'my' | 'all'>('my');

  const { data: myTasks, isLoading: loadingMyTasks, refetch: refetchMyTasks } =
    trpc.team.myTasks.useQuery({ limit: 50 });

  const { data: allTasks, isLoading: loadingAllTasks, refetch: refetchAllTasks } =
    trpc.team.allTasks.useQuery({ limit: 100 });

  const { data: needsAttention, refetch: refetchNeedsAttention } =
    trpc.team.needsAttention.useQuery();

  const updateStatusMutation = trpc.team.updateTaskStatus.useMutation();

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchMyTasks(),
      refetchAllTasks(),
      refetchNeedsAttention(),
    ]);
    setRefreshing(false);
  };

  const tasks = filter === 'my' ? myTasks : allTasks;
  const isLoading = filter === 'my' ? loadingMyTasks : loadingAllTasks;

  const handleUpdateStatus = async (
    taskId: string,
    status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED'
  ) => {
    try {
      await updateStatusMutation.mutateAsync({ id: taskId, status });
      await onRefresh();
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return '#ef4444';
      case 'HIGH':
        return '#f59e0b';
      case 'MEDIUM':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'TODO':
        return '#6b7280';
      case 'IN_PROGRESS':
        return '#3b82f6';
      case 'WAITING':
        return '#f59e0b';
      case 'COMPLETED':
        return '#10b981';
      default:
        return '#9ca3af';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'FOLLOW_UP':
        return '📞';
      case 'QUOTE':
        return '💰';
      case 'SCHEDULE_JOB':
        return '📅';
      case 'CALL_CUSTOMER':
        return '☎️';
      case 'SEND_INVOICE':
        return '📄';
      case 'COLLECT_PAYMENT':
        return '💵';
      case 'SITE_VISIT':
        return '🏠';
      default:
        return '📋';
    }
  };

  if (isLoading && !tasks) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>

        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.tab, filter === 'my' && styles.tabActive]}
            onPress={() => setFilter('my')}
          >
            <Text
              style={[styles.tabText, filter === 'my' && styles.tabTextActive]}
            >
              My Tasks ({myTasks?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, filter === 'all' && styles.tabActive]}
            onPress={() => setFilter('all')}
          >
            <Text
              style={[styles.tabText, filter === 'all' && styles.tabTextActive]}
            >
              All Tasks ({allTasks?.length || 0})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Needs Attention Banner */}
      {needsAttention && needsAttention.length > 0 && (
        <View style={styles.attentionBanner}>
          <Text style={styles.attentionText}>
            ⚠️ {needsAttention.length} tasks need attention (overdue or urgent)
          </Text>
        </View>
      )}

      <FlatList
        data={tasks}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <Text style={styles.taskIcon}>{getTypeIcon(item.type)}</Text>
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle}>{item.title}</Text>
                {item.description && (
                  <Text style={styles.taskDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.taskMeta}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: getStatusColor(item.status) },
                ]}
              >
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>

              <View
                style={[
                  styles.badge,
                  { backgroundColor: getPriorityColor(item.priority) },
                ]}
              >
                <Text style={styles.badgeText}>{item.priority}</Text>
              </View>

              {item.dueDate && (
                <Text style={styles.dueDate}>
                  Due: {format(new Date(item.dueDate), 'MMM d')}
                </Text>
              )}
            </View>

            {filter === 'all' && item.assignedTo && (
              <Text style={styles.assignedTo}>
                👤 Assigned to: {item.assignedTo.name}
              </Text>
            )}

            {item.createdBy && (
              <Text style={styles.createdBy}>
                Created by: {item.createdBy.name}
              </Text>
            )}

            {/* Quick Actions */}
            {item.status !== 'COMPLETED' && (
              <View style={styles.taskActions}>
                {item.status === 'TODO' && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleUpdateStatus(item.id, 'IN_PROGRESS')}
                  >
                    <Text style={styles.actionButtonText}>▶️ Start</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'IN_PROGRESS' && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.completeButton]}
                    onPress={() => handleUpdateStatus(item.id, 'COMPLETED')}
                  >
                    <Text style={styles.actionButtonText}>✓ Complete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tasks</Text>
            <Text style={styles.emptySubtext}>
              {filter === 'my'
                ? 'No tasks assigned to you'
                : 'No tasks in the system'}
            </Text>
          </View>
        }
        contentContainerStyle={tasks?.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: 'white',
  },
  attentionBanner: {
    backgroundColor: '#fef3c7',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  attentionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400e',
  },
  taskCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  taskHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  taskIcon: {
    fontSize: 24,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dueDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  assignedTo: {
    fontSize: 12,
    color: '#3b82f6',
    marginBottom: 4,
  },
  createdBy: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  taskActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  completeButton: {
    backgroundColor: '#10b981',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
  },
});
