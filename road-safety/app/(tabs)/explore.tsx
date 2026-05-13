import { StyleSheet, View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ExploreScreenGrid() {
  const features = [
    {
      icon: 'map',
      title: 'Road Analysis',
      description: 'Track, visualize, and filter road conditions on a live map.',
    },
    {
      icon: 'car',
      title: 'Route Planning',
      description: 'Find the smoothest path based on real-time road data.',
    },
    {
      icon: 'analytics',
      title: 'Stats & Severity',
      description: 'Analyze Good, Moderate, Bad, and Severe road segments.',
    },
    {
      icon: 'color-palette',
      title: 'Dark Theme',
      description: 'Optimized for night use and map-heavy navigation.',
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="road" size={120} color="#5D3FD3" style={{ marginBottom: 12 }} />
        <Text style={styles.title}>🛣️ Roadalysis</Text>
        <Text style={styles.subtitle}>Analyze and plan your journey with real-time road insights</Text>
      </View>

      {/* Features Grid */}
      <View style={styles.grid}>
        {features.map((item, index) => (
          <View key={index} style={styles.gridItem}>
            <Ionicons name={item.icon} size={36} color="#5D3FD3" style={{ marginBottom: 12 }} />
            <Text style={styles.gridTitle}>{item.title}</Text>
            <Text style={styles.gridDescription}>{item.description}</Text>
          </View>
        ))}
      </View>

      {/* External Links Grid */}
      <View style={[styles.grid, { marginTop: 24 }]}>
        <TouchableOpacity style={styles.gridItem}>
          <Ionicons name="logo-github" size={36} color="#FFF" style={{ marginBottom: 12 }} />
          <Text style={styles.gridTitle}>GitHub Repo</Text>
          <Text style={styles.gridDescription}>Explore the open-source algorithms behind Roadalysis</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.gridItem}>
          <Ionicons name="book" size={36} color="#FFF" style={{ marginBottom: 12 }} />
          <Text style={styles.gridTitle}>Documentation</Text>
          <Text style={styles.gridDescription}>Learn more about road quality metrics and data collection</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  subtitle: {
    color: '#888',
    textAlign: 'center',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  gridTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  gridDescription: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    lineHeight: 16,
  },
});