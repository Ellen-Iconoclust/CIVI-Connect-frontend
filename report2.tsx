import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import * as Location from 'expo-location';
import { Camera, CameraView } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import translate from 'translate';
import { WebView } from 'react-native-webview';
import { API_BASE_URL } from '../../constants/Config';

translate.engine = 'libre'; // Using LibreTranslate (free, open source)

const LANGUAGES = [
  { label: 'English', code: 'en-IN' },
  { label: 'Hindi', code: 'hi-IN' },
  { label: 'Tamil', code: 'ta-IN' },
  { label: 'Malayalam', code: 'ml-IN' },
  { label: 'Telugu', code: 'te-IN' },
  { label: 'Kannada', code: 'kn-IN' },
  { label: 'Odia', code: 'or-IN' },
  { label: 'Sanskrit', code: 'sa-IN' },
  { label: 'Gujarati', code: 'gu-IN' },
  { label: 'Bengali', code: 'bn-IN' },
];

interface IssueFormData {
  title: string;
  description: string;
  translated: string;
  issue_type: string;
  latitude: number;
  longitude: number;
  accuracy: number;
}

const issueTypes = [
  { label: 'Pothole', value: 'pothole' },
  { label: 'Malfunctioning Streetlight', value: 'streetlight' },
  { label: 'Overflowing Trash Bin', value: 'trash' },
  { label: 'Graffiti', value: 'graffiti' },
  { label: 'Water Leak', value: 'water_leak' },
  { label: 'Other', value: 'other' },
];

export default function ReportScreen() {
  const router = useRouter();
  const cameraRef = useRef<any>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [formData, setFormData] = useState<IssueFormData>({
    title: '',
    description: '',
    translated: '',
    issue_type: '',
    latitude: 0,
    longitude: 0,
    accuracy: 0,
  });

  // Initialize
  useEffect(() => {
    initializeScreen();
  }, []);

  useEffect(() => {
    if (formData.description) handleTranslate(formData.description, selectedLang.code);
    else setFormData(prev => ({ ...prev, translated: '' }));
  }, [formData.description, selectedLang]);

  const initializeScreen = async () => {
    await Promise.all([getLocationPermissions(), getCameraPermissions(), loadUser()]);
  };

  const getCameraPermissions = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasCameraPermission(status === 'granted');
    } catch {
      Alert.alert('Camera Error', 'Unable to access camera');
    }
  };

  const getLocationPermissions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required');
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(currentLocation);
      setFormData(prev => ({
        ...prev,
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy || 0,
      }));
    } catch {
      Alert.alert('Location Error', 'Unable to get your location');
    }
  };

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) setUser(JSON.parse(userData));
      else Alert.alert('Authentication Required', 'Please login to report an issue', [
        { text: 'Login', onPress: () => router.push({ pathname: '/login' }) }
      ]);
    } catch {}
  };

  const handleTranslate = async (text: string, langCode: string) => {
    try {
      if (!text.trim()) {
        setFormData(prev => ({ ...prev, translated: '' }));
        return;
      }
      const translated = await translate(text, { from: langCode, to: 'en' });
      setFormData(prev => ({ ...prev, translated }));
    } catch {
      setFormData(prev => ({ ...prev, translated: text }));
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, exif: false });
        setCapturedPhoto(photo.uri);
        setCameraVisible(false);
      } catch {
        Alert.alert('Camera Error', 'Failed to take picture');
      }
    }
  };

  const retakePicture = () => setCapturedPhoto(null);
  const toggleCameraType = () => setCameraFacing(cameraFacing === 'back' ? 'front' : 'back');

  const submitReport = async () => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please login to submit a report');
      return;
    }
    if (!formData.issue_type || !formData.description.trim() || !formData.translated.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('description', formData.translated);
      formDataToSend.append('issue_type', formData.issue_type);
      formDataToSend.append('latitude', formData.latitude.toString());
      formDataToSend.append('longitude', formData.longitude.toString());
      formDataToSend.append('accuracy', formData.accuracy.toString());

      if (capturedPhoto) {
        const uriParts = capturedPhoto.split('.');
        const fileType = uriParts[uriParts.length - 1];
        formDataToSend.append('image', {
          uri: capturedPhoto,
          type: `image/${fileType}`,
          name: `issue-photo.${fileType}`,
        } as any);
      }

      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        body: formDataToSend,
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', 'Issue reported successfully!', [
          { text: 'OK', onPress: () => { resetForm(); router.push({ pathname: '/(tabs)/explore' }); }}
        ]);
      } else Alert.alert('Error', data.error || 'Failed to submit report');
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      translated: '',
      issue_type: '',
      latitude: location?.coords.latitude || 0,
      longitude: location?.coords.longitude || 0,
      accuracy: location?.coords.accuracy || 0,
    });
    setCapturedPhoto(null);
  };

  if (cameraVisible) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing={cameraFacing} ref={cameraRef}>
          <View style={styles.cameraButtons}>
            <TouchableOpacity style={styles.flipButton} onPress={toggleCameraType}>
              <Ionicons name="camera-reverse" size={32} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setCameraVisible(false)}>
              <Ionicons name="close" size={32} color="white" />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  // WebView HTML for speech recognition
  const webSpeechHTML = `
    <!DOCTYPE html>
    <html>
    <body>
      <button id="startBtn" style="display:none;">Start</button>
      <script>
        const startBtn = document.getElementById('startBtn');
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = '${selectedLang.code}';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        function startRecognition() { recognition.start(); }

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          window.ReactNativeWebView.postMessage(transcript);
        }

        recognition.onerror = (event) => {
          window.ReactNativeWebView.postMessage('ERROR:' + event.error);
        }

        startRecognition();
      </script>
    </body>
    </html>
  `;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>Report New Issue</Text>
        <Text style={styles.subtitle}>Help improve your community by reporting civic issues</Text>
      </View>

      <View style={styles.formCard}>
        {/* Issue Type */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Issue Type *</Text>
          <TouchableOpacity style={styles.selectButton} onPress={() => setShowTypeMenu(true)}>
            <Text style={styles.selectButtonText}>
              {formData.issue_type ? issueTypes.find(t => t.value === formData.issue_type)?.label : 'Select issue type'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>

          <Modal visible={showTypeMenu} transparent animationType="fade" onRequestClose={() => setShowTypeMenu(false)}>
            <TouchableWithoutFeedback onPress={() => setShowTypeMenu(false)}>
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Select Issue Type</Text>
                  {issueTypes.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={styles.menuItem}
                      onPress={() => { setFormData(prev => ({ ...prev, issue_type: type.value })); setShowTypeMenu(false); }}
                    >
                      <Text style={styles.menuItemText}>{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        </View>

        {/* Multilingual Voice Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Describe the Issue *</Text>
          <View style={styles.voiceRow}>
            <View style={styles.langPicker}>
              <Text style={styles.langLabel}>Language:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {LANGUAGES.map(lang => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.langButton, selectedLang.code === lang.code && styles.langButtonSelected]}
                    onPress={() => setSelectedLang(lang)}
                  >
                    <Text style={[styles.langButtonText, selectedLang.code === lang.code && styles.langButtonTextSelected]}>
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          {/* WebView for voice recognition */}
          <WebView
            originWhitelist={['*']}
            source={{ html: webSpeechHTML }}
            onMessage={(event) => {
              const msg = event.nativeEvent.data;
              if (msg.startsWith('ERROR:')) Alert.alert('Voice Error', msg);
              else setFormData(prev => ({ ...prev, description: prev.description ? prev.description + ' ' + msg : msg }));
            }}
            style={{ height: 0 }} // hidden
          />
        </View>

        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Title (Optional)</Text>
          <TextInput
            value={formData.title}
            onChangeText={text => setFormData(prev => ({ ...prev, title: text }))}
            placeholder="Brief description of the issue"
            style={styles.textInput}
            placeholderTextColor="#999"
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            value={formData.description}
            onChangeText={text => setFormData(prev => ({ ...prev, description: text }))}
            placeholder="Describe the issue (type or use voice)"
            multiline
            numberOfLines={3}
            style={[styles.textInput, styles.textArea]}
            placeholderTextColor="#999"
          />
        </View>

        {/* Translated English */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description (English)</Text>
          <TextInput
            value={formData.translated}
            editable={false}
            multiline
            numberOfLines={3}
            style={[styles.textInput, styles.textArea, { backgroundColor: '#f0f0f0', color: '#333' }]}
            placeholder="Translation will appear here"
            placeholderTextColor="#999"
          />
        </View>

        {/* Photo Section */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Photo Evidence (Optional)</Text>
          {!capturedPhoto ? (
            <View style={styles.photoOptions}>
              <TouchableOpacity style={[styles.photoOption, styles.cameraOption]} onPress={() => setCameraVisible(true)}>
                <Ionicons name="camera" size={30} color="white" />
                <Text style={styles.photoOptionText}>Take Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.photoPreview}>
              <Image source={{ uri: capturedPhoto }} style={styles.capturedImage} />
              <View style={styles.photoControls}>
                <TouchableOpacity style={styles.retakeButton} onPress={retakePicture}>
                  <Text style={styles.retakeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Location */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Location</Text>
          <Text style={styles.locationStatus}>
            {location ? `Location acquired (Accuracy: ${Math.round(location.coords.accuracy || 0)}m)` : 'Acquiring location...'}
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, (loading || !formData.issue_type || !formData.description || !formData.translated) && styles.submitButtonDisabled]}
          onPress={submitReport}
          disabled={loading || !formData.issue_type || !formData.description || !formData.translated}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.submitButtonText}>Submit Report</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ecf0f1' },
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  cameraButtons: { flex: 1, backgroundColor: 'transparent', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', marginBottom: 30 },
  flipButton: { alignSelf: 'flex-end', alignItems: 'center', padding: 15 },
  captureButton: { alignSelf: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 4, borderColor: 'white', borderRadius: 50, height: 70, width: 70, justifyContent: 'center' },
  captureButtonInner: { backgroundColor: 'white', borderRadius: 30, height: 55, width: 55 },
  closeButton: { alignSelf: 'flex-end', alignItems: 'center', padding: 15 },
  headerCard: { backgroundColor: 'white', margin: 16, marginBottom: 8, padding: 20, borderRadius: 12, elevation: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#7f8c8d' },
  formCard: { backgroundColor: 'white', margin: 16, marginTop: 8, padding: 20, borderRadius: 12, elevation: 4 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#2c3e50', marginBottom: 8 },
  textInput: { backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  selectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12 },
  selectButtonText: { fontSize: 16, color: '#2c3e50' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '80%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#2c3e50' },
  menuItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  menuItemText: { fontSize: 16, color: '#2c3e50' },
  photoOptions: { flexDirection: 'row', justifyContent: 'space-between' },
  photoOption: { width: '100%', height: 120, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#3498db' },
  cameraOption: { backgroundColor: '#3498db' },
  photoOptionText: { marginTop: 8, color: 'white', fontWeight: '600' },
  photoPreview: { alignItems: 'center' },
  capturedImage: { width: '100%', height: 200, borderRadius: 12 },
  photoControls: { marginTop: 12 },
  retakeButton: { backgroundColor: '#e74c3c', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  retakeButtonText: { color: 'white', fontWeight: '600' },
  locationStatus: { color: '#7f8c8d', fontStyle: 'italic', fontSize: 14 },
  submitButton: { backgroundColor: '#3498db', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  submitButtonDisabled: { backgroundColor: '#bdc3c7' },
  submitButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  langPicker: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  langLabel: { fontWeight: 'bold', marginRight: 8, color: '#2c3e50' },
  langButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f0f0', marginRight: 6, borderWidth: 1, borderColor: '#ddd' },
  langButtonSelected: { backgroundColor: '#3498db', borderColor: '#3498db' },
  langButtonText: { color: '#2c3e50', fontWeight: 'bold' },
  langButtonTextSelected: { color: 'white' },
});
