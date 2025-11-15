import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import { format, startOfDay, endOfDay, addDays, isToday, isTomorrow } from 'date-fns';
import { requestCalendarPermissions } from '../../lib/calendar';

export default function CalendarScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [hasCalendarPermission, setHasCalendarPermission] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data: reminders, isLoading, refetch } = trpc.lead.pendingReminders.useQuery();
  const { data: tasks, refetch: refetchTasks } = trpc.team.myTasks.useQuery({
    limit: 50,
  });

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const granted = await requestCalendarPermissions();
    setHasCalendarPermission(granted);

    if (!granted) {
      Alert.alert(
        'Calendar Permission',
        'Please grant calendar permission to use this feature',
        [{ text: 'OK' }]
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchTasks()]);
    setRefreshing(false);
  };

  // Combine reminders and tasks into calendar events
  const calendarEvents = [
    ...(reminders?.map((r) => ({
      id: r.id,
      type: 'reminder' as const,
      title: r.title,
      description: r.description,
      date: new Date(r.remindAt),
      lead: r.lead,
    })) || []),
    ...(tasks
      ?.filter((t) => t.dueDate || t.scheduledFor)
      .map((t) => ({
        id: t.id,
        type: 'task' as const,
        title: t.title,
        description: t.description,
        date: new Date(t.dueDate || t.scheduledFor!),
        priority: t.priority,
        status: t.status,
      })) || []),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group events by date
  const eventsByDate: Record<string, typeof calendarEvents> = {};
  calendarEvents.forEach((event) => {
    const dateKey = format(event.date, 'yyyy-MM-dd');
    if (!eventsByDate[dateKey]) {
      eventsByDate[dateKey] = [];
    }
    eventsByDate[dateKey].push(event);
  });

  // Get next 7 days
  const dates = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const getEventIcon = (event: (typeof calendarEvents)[0]) => {
    if (event.type === 'reminder') return '🔔';
    return '✓';
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <Text style={styles.subtitle}>
          {calendarEvents.length} upcoming events
        </Text>
      </View>

      <FlatList
        data={dates}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyExtractor={(date) => date.toISOString()}
        renderItem={({ item: date }) => {
          const dateKey = format(date, 'yyyy-MM-dd');
          const events = eventsByDate[dateKey] || [];

          return (
            <View style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{getDateLabel(date)}</Text>
                <Text style={styles.dayDate}>{format(date, 'MMM d')}</Text>
              </View>

              {events.length === 0 ? (
                <View style={styles.noEventsCard}>
                  <Text style={styles.noEventsText}>No events</Text>
                </View>
              ) : (
                events.map((event) => (
                  <View key={event.id} style={styles.eventCard}>
                    <Text style={styles.eventIcon}>
                      {getEventIcon(event)}
                    </Text>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      {event.description && (
                        <Text style={styles.eventDescription} numberOfLines={2}>
                          {event.description}
                        </Text>
                      )}
                      <Text style={styles.eventTime}>
                        {format(event.date, 'h:mm a')}
                      </Text>

                      {event.type === 'reminder' && event.lead && (
                        <Text style={styles.eventLead}>
                          Lead: {event.lead.name} - {event.lead.phone}
                        </Text>
                      )}

                      {event.type === 'task' && (
                        <View style={styles.taskBadges}>
                          <View
                            style={[
                              styles.badge,
                              event.status === 'COMPLETED'
                                ? styles.badgeCompleted
                                : styles.badgePending,
                            ]}
                          >
                            <Text style={styles.badgeText}>
                              {event.status}
                            </Text>
                          </View>
                          {event.priority === 'URGENT' ||
                            (event.priority === 'HIGH' && (
                              <View
                                style={[styles.badge, styles.badgeUrgent]}
                              >
                                <Text style={styles.badgeText}>
                                  {event.priority}
                                </Text>
                              </View>
                            ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No upcoming events</Text>
            <Text style={styles.emptySubtext}>
              Set reminders from leads to see them here
            </Text>
          </View>
        }
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
  daySection: {
    marginTop: 16,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  dayDate: {
    fontSize: 14,
    color: '#6b7280',
  },
  noEventsCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  noEventsText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  eventCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  eventIcon: {
    fontSize: 24,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
    lineHeight: 20,
  },
  eventTime: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    marginBottom: 4,
  },
  eventLead: {
    fontSize: 12,
    color: '#6b7280',
  },
  taskBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeCompleted: {
    backgroundColor: '#10b981',
  },
  badgePending: {
    backgroundColor: '#6b7280',
  },
  badgeUrgent: {
    backgroundColor: '#ef4444',
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    paddingTop: 100,
    alignItems: 'center',
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
