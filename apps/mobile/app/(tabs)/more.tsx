import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import { requestSmsPermissions } from '../../lib/sms-reader';
import { requestCalendarPermissions } from '../../lib/calendar';

export default function MoreScreen() {
  const [smsPermission, setSmsPermission] = useState(false);
  const [calendarPermission, setCalendarPermission] = useState(false);

  const { data: stats } = trpc.team.stats.useQuery();

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const calGranted = await requestCalendarPermissions();
    setCalendarPermission(calGranted);
  };

  const handleRequestSmsPermission = async () => {
    const granted = await requestSmsPermissions();
    setSmsPermission(granted);

    if (granted) {
      Alert.alert('Success', 'SMS permission granted! The app can now read messages.');
    } else {
      Alert.alert('Denied', 'SMS permission was denied.');
    }
  };

  const handleRequestCalendarPermission = async () => {
    const granted = await requestCalendarPermissions();
    setCalendarPermission(granted);

    if (granted) {
      Alert.alert('Success', 'Calendar permission granted!');
    } else {
      Alert.alert('Denied', 'Calendar permission was denied.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Settings & Information</Text>
      </View>

      {/* Team Stats */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Team Statistics</Text>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Team Members:</Text>
            <Text style={styles.statValue}>{stats.activeMembers}</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Tasks:</Text>
            <Text style={styles.statValue}>{stats.totalTasks}</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>To Do:</Text>
            <Text style={[styles.statValue, styles.yellow]}>
              {stats.todoTasks}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>In Progress:</Text>
            <Text style={[styles.statValue, styles.blue]}>
              {stats.inProgressTasks}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Completed Today:</Text>
            <Text style={[styles.statValue, styles.green]}>
              {stats.completedToday}
            </Text>
          </View>
        </View>
      )}

      {/* Permissions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>

        <TouchableOpacity
          style={styles.permissionRow}
          onPress={handleRequestSmsPermission}
        >
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>SMS Messages</Text>
            <Text style={styles.permissionDesc}>
              Read messages to detect new leads
            </Text>
          </View>
          <View
            style={[
              styles.permissionStatus,
              smsPermission ? styles.permissionGranted : styles.permissionDenied,
            ]}
          >
            <Text style={styles.permissionStatusText}>
              {smsPermission ? '✓ Granted' : '✗ Denied'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.permissionRow}
          onPress={handleRequestCalendarPermission}
        >
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionTitle}>Calendar</Text>
            <Text style={styles.permissionDesc}>
              Create reminders and follow-up events
            </Text>
          </View>
          <View
            style={[
              styles.permissionStatus,
              calendarPermission
                ? styles.permissionGranted
                : styles.permissionDenied,
            ]}
          >
            <Text style={styles.permissionStatusText}>
              {calendarPermission ? '✓ Granted' : '✗ Denied'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Name:</Text>
          <Text style={styles.infoValue}>LeadFlow Pro</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version:</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Platform:</Text>
          <Text style={styles.infoValue}>Android</Text>
        </View>
      </View>

      {/* Features */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Features</Text>

        <View style={styles.featureList}>
          <Text style={styles.featureItem}>✓ AI-powered message generation</Text>
          <Text style={styles.featureItem}>✓ Native SMS integration (no Twilio costs)</Text>
          <Text style={styles.featureItem}>✓ Quick reminders (Now, 1hr, 3hr, Tomorrow)</Text>
          <Text style={styles.featureItem}>✓ Calendar integration</Text>
          <Text style={styles.featureItem}>✓ Team task management</Text>
          <Text style={styles.featureItem}>✓ Lead → Quote → Invoice workflow</Text>
          <Text style={styles.featureItem}>✓ Multi-user collaboration</Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  section: {
    backgroundColor: 'white',
    marginTop: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1f2937',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  statLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  yellow: {
    color: '#f59e0b',
  },
  blue: {
    color: '#3b82f6',
  },
  green: {
    color: '#10b981',
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  permissionDesc: {
    fontSize: 14,
    color: '#6b7280',
  },
  permissionStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  permissionGranted: {
    backgroundColor: '#10b981',
  },
  permissionDenied: {
    backgroundColor: '#ef4444',
  },
  permissionStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  featureList: {
    gap: 8,
  },
  featureItem: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 24,
  },
});
