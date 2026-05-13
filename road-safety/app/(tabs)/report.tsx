import { useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  background: "#121212",
  card: "#1E1E1E",
  primary: "#5D3FD3", // Match main page accent
  success: "#22C55E",
  danger: "#EF4444",
  text: "#FFFFFF",
  subtext: "#A1A1AA",
};

export default function ReportDamage() {
  const [image, setImage] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<{ class: string; confidence: number } | null>(null);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      alert("Camera permission required");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      alert("Location permission denied");
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setLocation(loc.coords);
  };

  const removePhoto = () => {
    setImage(null);
    setPrediction(null);
  };

  const upload = async () => {
    if (!image || !location) {
      alert("Please take photo and get location");
      return;
    }
    try {
      setLoading(true);
      setPrediction(null);

      const formData = new FormData();
      formData.append("file", { uri: image, name: "road.jpg", type: "image/jpeg" } as any);
      formData.append("latitude", location.latitude.toString());
      formData.append("longitude", location.longitude.toString());
const response = await fetch("http://192.168.29.18:8000/detect-roboflow", {
  method: "POST",
  body: formData,  // do NOT set Content-Type manually
});

      const data = await response.json();

      if (data.predictions?.predictions?.length > 0) {
        const pred = data.predictions.predictions[0];
        setPrediction({ class: pred.class, confidence: pred.confidence });
      } else {
        alert("No potholes detected");
      }
    } catch (error) {
      console.log(error);
      alert("Detection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Report Road Damage</Text>

      <View style={styles.imageContainer}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="camera-outline" size={50} color={COLORS.subtext} />
            <Text style={styles.placeholderText}>Take a photo of the pothole</Text>
          </View>
        )}
      </View>

      {image && (
        <TouchableOpacity style={styles.retakeButton} onPress={removePhoto}>
          <Ionicons name="refresh" size={18} color="white" />
          <Text style={styles.buttonText}>Retake Photo</Text>
        </TouchableOpacity>
      )}

      {prediction && (
        <View style={styles.predictionCard}>
          <Text style={styles.predictionTitle}>Detected: {prediction.class}</Text>
          <Text style={styles.predictionSubtext}>
            Confidence: {(prediction.confidence * 100).toFixed(1)}%
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={takePhoto}>
        <Ionicons name="camera" size={20} color="white" />
        <Text style={styles.buttonText}>Take Photo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={getLocation}>
        <Ionicons name="location" size={20} color="white" />
        <Text style={styles.buttonText}>{location ? "Location Captured" : "Get Location"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.uploadButton, (!image || !location) && { opacity: 0.5 }]}
        onPress={upload}
        disabled={!image || !location || loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Ionicons name="cloud-upload" size={20} color="white" />
            <Text style={styles.buttonText}>Upload Report</Text>
          </>
        )}
      </TouchableOpacity>

      {location && (
        <Text style={styles.coords}>
          📍 {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 25,
  },

  imageContainer: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 25,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  image: {
    width: "100%",
    height: "100%",
  },

  placeholder: {
    alignItems: "center",
  },

  placeholderText: {
    marginTop: 10,
    color: COLORS.subtext,
  },

  retakeButton: {
    flexDirection: "row",
    backgroundColor: "#2C2C2C",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    width: "100%",
  },

  primaryButton: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 14,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },

  secondaryButton: {
    flexDirection: "row",
    backgroundColor: "#5D3FD3", // use same accent
    padding: 14,
    borderRadius: 14,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },

  uploadButton: {
    flexDirection: "row",
    backgroundColor: "#A855F7", // purple for upload
    padding: 16,
    borderRadius: 14,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },

  buttonText: {
    color: "white",
    marginLeft: 8,
    fontWeight: "600",
  },

  coords: {
    marginTop: 15,
    color: COLORS.subtext,
  },

  predictionCard: {
    marginTop: 20,
    padding: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },

  predictionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "bold",
  },

  predictionSubtext: {
    color: COLORS.subtext,
    fontSize: 14,
    marginTop: 4,
  },
});