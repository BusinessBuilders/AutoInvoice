import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { trpc } from '../lib/trpc';

export default function Dashboard() {
  const { data: stats } = trpc.invoice.stats.useQuery();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>AutoInvoice Mobile</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Invoices</Text>
          <Text style={styles.statValue}>{stats?.total || 0}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Paid</Text>
          <Text style={[styles.statValue, styles.green]}>{stats?.paid || 0}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={[styles.statValue, styles.yellow]}>{stats?.sent || 0}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Overdue</Text>
          <Text style={[styles.statValue, styles.red]}>{stats?.overdue || 0}</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Welcome to AutoInvoice!</Text>
        <Text style={styles.infoText}>
          AI-powered invoice automation at your fingertips.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  green: {
    color: '#22c55e',
  },
  yellow: {
    color: '#eab308',
  },
  red: {
    color: '#ef4444',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
});
