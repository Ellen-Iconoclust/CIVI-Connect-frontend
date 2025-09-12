import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Alert,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../constants/Config';

interface AdminStats {
  total_issues: number;
  pending_issues: number;
  in_progress_issues: number;
  resolved_issues: number;
  recent_issues: number;
  response_time_avg: number;
  issue_types: Record<string, number>;
}

interface Issue {
  id: number;
  title: string;
  description: string;
  issue_type: string;
  status: string;
  priority: string;
  latitude: number;
  longitude: number;
  address: string;
  image_url: string;
  reported_by: number;
  created_at: string;
  updated_at: string;
}

const statusActions = [
  { label: 'Acknowledge', value: 'acknowledged', color: '#f39c12' },
  { label: 'In Progress', value: 'in_progress', color: '#3498db' },
  { label: 'Resolve', value: 'resolved', color: '#27ae60' },
];

export default function AdminScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    initializeScreen();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const timeoutId = setTimeout(() => {
        loadAllIssues();
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      loadAllIssues();
    }
  }, [searchQuery]);

  const initializeScreen = async () => {
    const userData = await loadUser();
    if (userData && userData.role === 'admin') {
      await Promise.all([loadAdminStats(), loadAllIssues()]);
    }
    setLoading(false);
  };

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        return parsedUser;
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
    return null;
  };

  const loadAdminStats = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      console.log("🔑 Token for stats:", token);

      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json().catch(() => ({}));
      console.log("📊 Stats response:", response.status, data);

      if (response.ok) {
        setStats(data);
      } else {
        throw new Error(`Failed to load stats (${response.status})`);
      }
    } catch (error) {
      console.error('Error loading admin stats:', error);
      Alert.alert('Error', 'Failed to load statistics');
    }
  };

  const loadAllIssues = async () => {
    try {
      let url = `${API_BASE_URL}/api/issues`;
      if (searchQuery) url += `?search=${encodeURIComponent(searchQuery)}`;

      const token = await AsyncStorage.getItem('token');
      console.log("🔑 Token for issues:", token);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json().catch(() => ({}));
      console.log("🐞 Issues response:", response.status, data);

      if (response.ok) {
        setIssues(data.issues || []);
      } else {
        throw new Error(`Failed to load issues (${response.status})`);
      }
    } catch (error) {
      console.error('Error loading issues:', error);
      Alert.alert('Error', 'Failed to load issues');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAdminStats(), loadAllIssues()]);
    setRefreshing(false);
  };

  const updateIssueStatus = async (issueId: number, newStatus: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json().catch(() => ({}));
      console.log("✏️ Update issue response:", response.status, data);

      if (response.ok) {
        Alert.alert('Success', 'Issue status updated successfully');
        await Promise.all([loadAdminStats(), loadAllIssues()]);
      } else {
        throw new Error(`Failed to update status (${response.status})`);
      }
    } catch (error) {
      console.error('Error updating issue status:', error);
      Alert.alert('Error', 'Failed to update issue status');
    }
  };

  const deleteIssue = async (issueId: number) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to remove this issue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });

            const data = await response.json().catch(() => ({}));
            console.log("🗑️ Delete issue response:", response.status, data);

            if (response.ok) {
              Alert.alert('Success', 'Issue removed successfully');
              await Promise.all([loadAdminStats(), loadAllIssues()]);
            } else {
              throw new Error(`Failed to delete issue (${response.status})`);
            }
          } catch (error) {
            console.error('Error deleting issue:', error);
            Alert.alert('Error', 'Failed to remove issue');
          }
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reported':
        return '#e74c3c';
      case 'acknowledged':
        return '#f39c12';
      case 'in_progress':
        return '#3498db';
      case 'resolved':
        return '#27ae60';
      default:
        return '#7f8c8d';
    }
  };

  const getStatusText = (status: string) => status.replace('_', ' ').toUpperCase();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Admin Access Required</Text>
        <Text style={styles.subtitle}>
          Please login as an administrator to access this section
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/login')}>
          <Text style={styles.buttonText}>Admin Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (user.role !== 'admin') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.title}>Access Denied</Text>
        <Text style={styles.subtitle}>You do not have administrator privileges</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.subtitle}>Loading admin dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.card}>
        <Text style={styles.title}>Administrator Dashboard</Text>
        <Text style={styles.subtitle}>
          Welcome, {user.name} - {user.department}
        </Text>
      </View>

      {/* Statistics */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>System Overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#3498db' }]}>{stats.total_issues}</Text>
              <Text style={styles.statLabel}>Total Reports</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#e74c3c' }]}>
                {stats.pending_issues}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#f39c12' }]}>
                {stats.in_progress_issues}
              </Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#27ae60' }]}>
                {stats.resolved_issues}
              </Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Recent issues: {stats.recent_issues}</Text>
          <Text style={styles.subtitle}>
            Avg. response time: {stats.response_time_avg} days
          </Text>
        </View>
      )}

      {/* Search */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>All Reported Issues</Text>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search issues..."
          style={styles.input}
        />
      </View>

      {/* Issues List */}
      <View style={styles.issuesContainer}>
        {issues.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.title}>No Issues Found</Text>
            <Text style={styles.subtitle}>
              {searchQuery ? 'No issues match your search' : 'No issues reported yet'}
            </Text>
          </View>
        ) : (
          issues.map((issue) => (
            <View key={issue.id} style={styles.card}>
              <View style={styles.issueHeader}>
                <Text style={[styles.chip, { backgroundColor: '#3498db' }]}>
                  {issue.issue_type.toUpperCase()}
                </Text>
                <Text style={[styles.chip, { backgroundColor: getStatusColor(issue.status) }]}>
                  {getStatusText(issue.status)}
                </Text>
              </View>

              <Text style={styles.issueTitle}>{issue.title}</Text>
              {issue.description ? <Text>{issue.description}</Text> : null}

              {issue.image_url ? (
                <Image
                  source={{ uri: `${API_BASE_URL}${issue.image_url}` }}
                  style={styles.issueImage}
                />
              ) : null}

              <Text style={styles.infoText}>Reported by: User #{issue.reported_by}</Text>
              <Text style={styles.infoText}>Date: {formatDate(issue.created_at)}</Text>
              {issue.address && <Text style={styles.infoText}>Location: {issue.address}</Text>}

              <View style={styles.actionRow}>
                {statusActions.map((action) => (
                  <TouchableOpacity
                    key={action.value}
                    onPress={() => updateIssueStatus(issue.id, action.value)}
                    disabled={issue.status === action.value}
                    style={[styles.actionButton, { backgroundColor: action.color }]}
                  >
                    <Text style={styles.buttonText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => deleteIssue(issue.id)}
                  style={[styles.actionButton, { borderColor: '#e74c3c', borderWidth: 1 }]}
                >
                  <Text style={{ color: '#e74c3c' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ecf0f1' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', padding: 16, margin: 12, borderRadius: 10, elevation: 2 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: '#7f8c8d', textAlign: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#2c3e50' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: '#7f8c8d' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, backgroundColor: '#fff' },
  issuesContainer: { marginHorizontal: 12 },
  issueHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  chip: {
    color: 'white',
    fontWeight: 'bold',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  issueTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  issueImage: { width: '100%', height: 200, borderRadius: 10, marginVertical: 8 },
  infoText: { fontSize: 12, color: '#7f8c8d', marginBottom: 4 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionButton: {
    flex: 1,
    margin: 4,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  button: { backgroundColor: '#2c3e50', padding: 12, borderRadius: 8, marginTop: 12 },
  buttonText: { color: 'white', fontWeight: 'bold' },
});

