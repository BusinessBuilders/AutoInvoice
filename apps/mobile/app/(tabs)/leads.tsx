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
import { useRouter } from 'expo-router';
import { trpc } from '../../lib/trpc';
import { format } from 'date-fns';

export default function LeadsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: leads, isLoading, refetch } = trpc.lead.list.useQuery({
    status: undefined, // All leads
    limit: 50,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
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
      case 'NEW':
        return '#3b82f6';
      case 'CONTACTED':
        return '#8b5cf6';
      case 'QUALIFIED':
        return '#10b981';
      case 'QUOTED':
        return '#f59e0b';
      case 'WON':
        return '#22c55e';
      case 'LOST':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  if (isLoading && !leads) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leads</Text>
        <Text style={styles.subtitle}>
          {leads?.length || 0} total leads
        </Text>
      </View>

      <FlatList
        data={leads}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.leadCard}
            onPress={() => router.push(`/lead/${item.id}` as any)}
          >
            <View style={styles.leadHeader}>
              <Text style={styles.leadName}>{item.name}</Text>
              <View
                style={[
                  styles.priorityBadge,
                  { backgroundColor: getPriorityColor(item.priority) },
                ]}
              >
                <Text style={styles.badgeText}>{item.priority}</Text>
              </View>
            </View>

            <Text style={styles.leadPhone}>{item.phone}</Text>

            {item.message && (
              <Text style={styles.leadMessage} numberOfLines={2}>
                {item.message}
              </Text>
            )}

            <View style={styles.leadFooter}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(item.status) },
                ]}
              >
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>

              {item.projectType && (
                <Text style={styles.projectType}>{item.projectType}</Text>
              )}

              <Text style={styles.leadDate}>
                {format(new Date(item.createdAt), 'MMM d, h:mm a')}
              </Text>
            </View>

            {item.nextFollowUpAt && (
              <View style={styles.followUpBanner}>
                <Text style={styles.followUpText}>
                  📅 Follow up:{' '}
                  {format(new Date(item.nextFollowUpAt), 'MMM d, h:mm a')}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No leads yet</Text>
            <Text style={styles.emptySubtext}>
              New messages will appear here automatically
            </Text>
          </View>
        }
        contentContainerStyle={leads?.length === 0 ? styles.emptyList : undefined}
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
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  leadCard: {
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
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  leadName: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  leadPhone: {
    fontSize: 16,
    color: '#3b82f6',
    marginBottom: 8,
  },
  leadMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  leadFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  projectType: {
    fontSize: 12,
    color: '#6b7280',
  },
  leadDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  followUpBanner: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 4,
  },
  followUpText: {
    fontSize: 12,
    color: '#92400e',
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
