import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../lib/trpc';
import { format } from 'date-fns';
import { sendSmsViaNativeApp } from '../../lib/sms-reader';
import { REMINDER_PRESETS, createReminder } from '../../lib/calendar';

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [generatedMessage, setGeneratedMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editedMessage, setEditedMessage] = useState<string>('');

  const { data: lead, isLoading } = trpc.lead.getById.useQuery({ id: id! });

  const generateMessageMutation = trpc.lead.generateMessage.useMutation();
  const setReminderMutation = trpc.lead.setReminder.useMutation();
  const updateStatusMutation = trpc.lead.updateStatus.useMutation();

  const handleGenerateMessage = async () => {
    if (!lead) return;

    setIsGenerating(true);
    try {
      const result = await generateMessageMutation.mutateAsync({
        leadId: lead.id,
        context: lead.message || undefined,
      });

      setGeneratedMessage(result.message);
      setEditedMessage(result.message);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate message');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!lead || !editedMessage) return;

    try {
      // Open native SMS app with pre-filled message
      await sendSmsViaNativeApp(lead.phone, editedMessage);

      // Update lead status to CONTACTED
      await updateStatusMutation.mutateAsync({
        id: lead.id,
        status: 'CONTACTED',
      });

      utils.lead.invalidate();

      Alert.alert('Success', 'Message ready to send!');
    } catch (error) {
      Alert.alert('Error', 'Failed to open messaging app');
    }
  };

  const handleSetReminder = async (preset: keyof typeof REMINDER_PRESETS) => {
    if (!lead) return;

    const reminderConfig = REMINDER_PRESETS[preset];
    const remindAt = reminderConfig.getDate();

    try {
      await setReminderMutation.mutateAsync({
        leadId: lead.id,
        title: `Follow up with ${lead.name}`,
        description: lead.message,
        remindAt,
      });

      // Also create calendar event
      await createReminder({
        title: `Follow up with ${lead.name}`,
        description: lead.message,
        remindAt,
        leadId: lead.id,
      });

      utils.lead.invalidate();

      Alert.alert('Success', `Reminder set for ${reminderConfig.label}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to set reminder');
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!lead) {
    return (
      <View style={styles.centerContainer}>
        <Text>Lead not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Lead Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        <Text style={styles.leadName}>{lead.name}</Text>
        <Text style={styles.leadPhone}>{lead.phone}</Text>
        {lead.email && <Text style={styles.leadEmail}>{lead.email}</Text>}

        <View style={styles.statusRow}>
          <View style={[styles.badge, styles.statusBadge]}>
            <Text style={styles.badgeText}>{lead.status}</Text>
          </View>
          <View style={[styles.badge, styles.priorityBadge]}>
            <Text style={styles.badgeText}>{lead.priority}</Text>
          </View>
        </View>
      </View>

      {/* Original Message */}
      {lead.message && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Original Message</Text>
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{lead.message}</Text>
          </View>
        </View>
      )}

      {/* Project Info */}
      {lead.projectType && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Project Details</Text>
          <Text style={styles.infoText}>Type: {lead.projectType}</Text>
          {lead.estimatedArea && (
            <Text style={styles.infoText}>Area: {lead.estimatedArea} sqft</Text>
          )}
          {lead.estimatedValue && (
            <Text style={styles.infoText}>
              Estimated Value: ${lead.estimatedValue}
            </Text>
          )}
        </View>
      )}

      {/* AI Response Generator */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Response Generator</Text>

        <TouchableOpacity
          style={[styles.primaryButton, isGenerating && styles.buttonDisabled]}
          onPress={handleGenerateMessage}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>✨ Generate Response</Text>
          )}
        </TouchableOpacity>

        {generatedMessage && (
          <View style={styles.messagePreview}>
            <Text style={styles.previewLabel}>AI Generated Message:</Text>
            <TextInput
              style={styles.messageInput}
              multiline
              numberOfLines={6}
              value={editedMessage}
              onChangeText={setEditedMessage}
              placeholder="Edit message before sending..."
            />

            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendMessage}
            >
              <Text style={styles.buttonText}>📱 Send via SMS</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Quick Reminders */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Set Reminder</Text>

        <View style={styles.reminderGrid}>
          <TouchableOpacity
            style={styles.reminderButton}
            onPress={() => handleSetReminder('NOW')}
          >
            <Text style={styles.reminderButtonText}>⚡ Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reminderButton}
            onPress={() => handleSetReminder('ONE_HOUR')}
          >
            <Text style={styles.reminderButtonText}>🕐 1 Hour</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reminderButton}
            onPress={() => handleSetReminder('THREE_HOURS')}
          >
            <Text style={styles.reminderButtonText}>🕒 3 Hours</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reminderButton}
            onPress={() => handleSetReminder('TOMORROW')}
          >
            <Text style={styles.reminderButtonText}>🌅 Tomorrow</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reminderButton}
            onPress={() => handleSetReminder('NEXT_WEEK')}
          >
            <Text style={styles.reminderButtonText}>📆 Next Week</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Existing Reminders */}
      {lead.reminders && lead.reminders.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Reminders</Text>
          {lead.reminders.map((reminder) => (
            <View key={reminder.id} style={styles.reminderCard}>
              <Text style={styles.reminderTitle}>{reminder.title}</Text>
              <Text style={styles.reminderTime}>
                {format(new Date(reminder.remindAt), 'MMM d, yyyy h:mm a')}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
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
  section: {
    backgroundColor: 'white',
    marginTop: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1f2937',
  },
  leadName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  leadPhone: {
    fontSize: 18,
    color: '#3b82f6',
    marginBottom: 4,
  },
  leadEmail: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadge: {
    backgroundColor: '#3b82f6',
  },
  priorityBadge: {
    backgroundColor: '#f59e0b',
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  messageBox: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  infoText: {
    fontSize: 16,
    marginBottom: 8,
    color: '#374151',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  messagePreview: {
    marginTop: 16,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#6b7280',
  },
  messageInput: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  sendButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  reminderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reminderButton: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reminderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  reminderCard: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 4,
  },
  reminderTime: {
    fontSize: 12,
    color: '#92400e',
  },
});
