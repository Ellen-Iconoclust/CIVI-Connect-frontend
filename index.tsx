import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  ScrollView, 
  View, 
  Alert, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  StatusBar 
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { API_BASE_URL } from '../../constants/Config';

interface Issue {
  id: number;
  title: string;
  description: string;
  issue_type: string;
  status: string;
  latitude: number;
  longitude: number;
  address: string;
  created_at: string;
}

interface Stats {
  total_issues: number;
  resolved_issues: number;
  pending_issues: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stats, setStats] = useState<Stats>({ total_issues: 0, resolved_issues: 0, pending_issues: 0 });
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    initializeScreen();
    connectSocket();
  }, []);

  const connectSocket = () => {
    const socket = io(API_BASE_URL);
    
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('new_issue', (data) => {
      loadIssues();
    });

    socket.on('issue_updated', (data) => {
      setIssues(prev => prev.map(issue => 
        issue.id === data.issue_id 
          ? { ...issue, status: data.status }
          : issue
      ));
    });

    return () => socket.disconnect();
  };

  const initializeScreen = async () => {
    await Promise.all([
      getLocation(),
      loadUser(),
      loadIssues(),
      loadStats()
    ]);
    setLoading(false);
  };

  const getLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to show nearby issues');
        return;
      }

      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(location);
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const loadIssues = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/issues`);
      const data = await response.json();
      setIssues(data.issues || []);
    } catch (error) {
      console.error('Error loading issues:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/issues`);
      const data = await response.json();
      
      const total = data.total || 0;
      const resolved = data.issues ? data.issues.filter((issue: Issue) => issue.status === 'resolved').length : 0;
      const pending = total - resolved;
      
      setStats({
        total_issues: total,
        resolved_issues: resolved,
        pending_issues: pending
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const getMarkerColor = (status: string) => {
    switch (status) {
      case 'reported': return 'red';
      case 'acknowledged': return 'orange';
      case 'in_progress': return 'blue';
      case 'resolved': return 'green';
      default: return 'gray';
    }
  };

  // Generate HTML for Leaflet map
  const generateMapHTML = () => {
    const centerLat = location?.coords.latitude || 11.0168;
    const centerLng = location?.coords.longitude || 76.9558;
    
    const markersHTML = issues.map(issue => {
      const popupContent = `<b>${issue.title}</b><br/>Type: ${issue.issue_type}<br/>Status: ${issue.status}<br/>${issue.address}`;
      
      return `
        L.marker([${issue.latitude}, ${issue.longitude}])
          .addTo(map)
          .bindPopup('${popupContent.replace(/'/g, "\\'")}')
          .setIcon(
            L.icon({
              iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${getMarkerColor(issue.status)}.png',
              shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41]
            })
          );
      `;
    }).join('');

    const userLocationHTML = location ? `
      L.marker([${location.coords.latitude}, ${location.coords.longitude}])
        .addTo(map)
        .setIcon(
          L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
          })
        )
        .bindPopup('Your Location');
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
          #map { width: 100%; height: 100%; }
          html, body { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${centerLat}, ${centerLng}], 13);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);

          ${markersHTML}

          ${userLocationHTML}
        </script>
      </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <StatusBar backgroundColor="#3498db" />
      
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>CIVI-Connect</Text>
            <Text style={styles.subtitle}>
              {user ? `Welcome, ${user.name}` : 'Welcome, Guest'}
            </Text>
          </View>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color="white" />
          </View>
        </View>
      </View>

      {/* Quick Report Button */}
      <View style={styles.quickReportCard}>
        <Text style={styles.cardTitle}>Report Civic Issues</Text>
        <Text style={styles.cardSubtitle}>
          Help make your community better by reporting issues like potholes, broken streetlights, and more.
        </Text>
        <TouchableOpacity 
          style={styles.reportButton}
          onPress={() => router.push('/report')}
        >
          <Text style={styles.reportButtonText}>Report an Issue</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total_issues}</Text>
          <Text style={styles.statLabel}>Total Issues</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#27ae60' }]}>{stats.resolved_issues}</Text>
          <Text style={styles.statLabel}>Resolved</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#e74c3c' }]}>{stats.pending_issues}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
      </View>

      {/* Map - Using Leaflet WebView */}
      <View style={styles.mapCard}>
        <Text style={styles.cardTitle}>Recent Issues Near You</Text>
        <View style={styles.mapContainer}>
          {mapLoading && (
            <View style={styles.mapLoadingOverlay}>
              <ActivityIndicator size="large" color="#3498db" />
              <Text style={styles.mapLoadingText}>Loading map...</Text>
            </View>
          )}
          <WebView
            originWhitelist={['*']}
            source={{ html: generateMapHTML() }}
            style={styles.map}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={true}
            onLoadStart={() => setMapLoading(true)}
            onLoadEnd={() => setMapLoading(false)}
            onError={(error) => {
              console.log('WebView error:', error);
              setMapLoading(false);
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ecf0f1',
    paddingTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ecf0f1',
  },
  loadingText: {
    marginTop: 16,
    color: '#7f8c8d',
    fontSize: 16,
  },
  headerCard: {
    margin: 16,
    marginTop: 20,
    marginBottom: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickReportCard: {
    margin: 16,
    marginVertical: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#2c3e50',
  },
  cardSubtitle: {
    fontSize: 14,
    marginBottom: 16,
    color: '#7f8c8d',
    lineHeight: 20,
  },
  reportButton: {
    backgroundColor: '#3498db',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  reportButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 16,
    marginVertical: 8,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignItems: 'center',
    minWidth: 0,
    maxWidth: 120,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3498db',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  mapCard: {
    margin: 16,
    marginVertical: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
    position: 'relative',
  },
  map: {
    flex: 1,
    minHeight: 300,
  },
  mapLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  mapLoadingText: {
    marginTop: 12,
    color: '#3498db',
    fontSize: 16,
  },
});
