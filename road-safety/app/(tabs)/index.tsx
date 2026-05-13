// App.js - Complete with Dotted Colored Path + LIVE Jerk/GPS Alignment + Backend POST + DOWNSAMPLING
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  RefreshControl,
  Platform,
  FlatList,
  Animated,
  StatusBar as RNStatusBar,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import MapView, { Polyline, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import polyline from '@mapbox/polyline';
import Constants from 'expo-constants';
import * as Location from 'expo-location';

// ============================================
// CONFIG
// ============================================
const LOCATIONIQ_API_KEY = 'pk.4856bfe7db093c043f65563dcf72f3c4'; // ← YOUR KEY

// Backend (Node/Express)
const BACKEND_URL = 'http://192.168.29.18:3000';
const BRIDGE_URL  = 'http://192.168.29.18:4000';

// Polling + buffer
const POLL_MS = 200;         // jerk polling interval
const GPS_BUFFER_MAX = 200;  // keep last ~200 GPS samples (~80s if 400ms each)

const SAME_LOC_M = 6;              // treat within 6 meters as "same place" (GPS jitter safe)
const SAME_SPOT_COOLDOWN_MS = 10000; // 10 seconds
const MOVE_DIST_M = 12;            // if moved 12m+, we allow saving (even before 10s)
const MIN_MOVE_MS = 1500;          // don’t save faster than this while moving

// While testing, refresh map/UI from backend more frequently:
const LIVE_REFRESH_MS = 5000; // set back to 30000 later

const { width: SW, height: SH } = Dimensions.get('window');

const STATUS_BAR_HEIGHT = Platform.OS === 'android'
  ? RNStatusBar.currentHeight || 40
  : Constants.statusBarHeight || 44;

const COLORS = {
  primary: '#5D3FD3',
  primaryLight: '#7B61FF',
  primaryDark: '#3D1FA3',
  bg: '#0D0D0D',
  card: '#1A1A1A',
  cardLight: '#252525',
  text: '#FFFFFF',
  muted: '#777',
  green: '#00E676',
  yellow: '#FFD600',
  orange: '#FF6D00',
  red: '#FF1744',
  border: '#2A2A2A',
};

const THRESHOLDS = { GOOD: 0.5, MOD: 1.0, BAD: 1.5 };

const getColor = (v) =>
  v >= THRESHOLDS.BAD ? COLORS.red
    : v >= THRESHOLDS.MOD ? COLORS.orange
      : v >= THRESHOLDS.GOOD ? COLORS.yellow
        : COLORS.green;

const getLabel = (v) =>
  v >= THRESHOLDS.BAD ? 'Severe'
    : v >= THRESHOLDS.MOD ? 'Bad'
      : v >= THRESHOLDS.GOOD ? 'Moderate'
        : 'Good';

const getIcon = (v) =>
  v >= THRESHOLDS.BAD ? 'warning'
    : v >= THRESHOLDS.MOD ? 'alert-circle'
      : v >= THRESHOLDS.GOOD ? 'alert'
        : 'checkmark-circle';

const formatTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDate = (d) => new Date(d).toLocaleDateString([], { day: '2-digit', month: 'short' });

const decodePolyline = (enc) =>
  polyline.decode(enc).map(([lat, lng]) => ({ latitude: lat, longitude: lng }));

// ============================================
// MAP STYLES
// ============================================
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#555' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#333' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#666' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#404040' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
];

const LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e8fc' }] },
  { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5f5e0' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f0f0f0' }] },
];

const INITIAL_REGION = {
  latitude: 28.4595,
  longitude: 77.0266,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

// ============================================
// HELPERS (LIVE PIPELINE)
// ============================================
function findClosestGpsSample(buffer, tTarget) {
  if (!buffer || buffer.length === 0) return null;
  let best = buffer[0];
  let bestDt = Math.abs(best.t - tTarget);
  for (const s of buffer) {
    const dt = Math.abs(s.t - tTarget);
    if (dt < bestDt) { best = s; bestDt = dt; }
  }
  return best;
}

function jerkLevel(j) {
  if (j >= THRESHOLDS.BAD) return 'Severe';
  if (j >= THRESHOLDS.MOD) return 'Bad';
  if (j >= THRESHOLDS.GOOD) return 'Moderate';
  return 'Good';
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

// Event thresholds
const EVENT_JERK = THRESHOLDS.MOD;     // event starts here (change to THRESHOLDS.GOOD if you want "Moderate+" in your label system)
const SEVERE_JERK = THRESHOLDS.BAD;    // severe

// Cooldowns
const EVENT_COOLDOWN_MS = 2000;        // Moderate/Bad cooldown
const SEVERE_COOLDOWN_MS = 500;        // Severe cooldown (faster logging)      // at most 1 event every 2s

function shouldSendPoint({ lastSent, candidate, jerk }) {
  if (!candidate) return false;
  if (!lastSent) return true;

  const dt = candidate.t - lastSent.t;

  const dist = haversineMeters(
    lastSent.latitude, lastSent.longitude,
    candidate.latitude, candidate.longitude
  );

  const sameSpot = dist <= SAME_LOC_M;

  // ✅ Severe events (fast cooldown)
  if (jerk >= SEVERE_JERK) {
    const lastSevereT = lastSent.lastSevereT ?? 0;
    return (candidate.t - lastSevereT) >= SEVERE_COOLDOWN_MS;
  }

  // ✅ Moderate/Bad events (slower cooldown)
  if (jerk >= EVENT_JERK) {
    const lastEventT = lastSent.lastEventT ?? 0;
    return (candidate.t - lastEventT) >= EVENT_COOLDOWN_MS;
  }

  // ✅ Smooth road rules
  if (sameSpot) return dt >= SAME_SPOT_COOLDOWN_MS;
  if (dist >= MOVE_DIST_M) return dt >= MIN_MOVE_MS;
  return dt >= SAME_SPOT_COOLDOWN_MS;
}
// ============================================
// BUILD PATH
// ============================================
const buildColoredPath = (data) => {
  if (!data || data.length < 2) return { segments: [], points: [] };

  const sorted = [...data]
    .filter(d => d.latitude && d.longitude && !isNaN(d.latitude))
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  const segments = [];
  const points = [];

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];

    points.push({
      latitude: curr.latitude,
      longitude: curr.longitude,
      color: getColor(curr.jerk_value),
      jerkValue: curr.jerk_value,
      isStart: i === 0,
      isEnd: i === sorted.length - 1,
    });

    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const avg = (curr.jerk_value + next.jerk_value) / 2;

      segments.push({
        coordinates: [
          { latitude: curr.latitude, longitude: curr.longitude },
          { latitude: next.latitude, longitude: next.longitude },
        ],
        color: getColor(avg),
        jerkValue: avg,
      });
    }
  }

  return { segments, points };
};

// ============================================
// BRAND HEADER
// ============================================
const BrandHeader = React.memo(({ status, updated, dataCount, onSync, onInfo, liveEnabled, onToggleLive }) => (
  <View style={styles.brandHeader}>
    <View style={styles.brandLeft}>
      <View style={styles.brandLogoCircle}>
        <Ionicons name="road" size={16} color={COLORS.primary} />
      </View>
      <View>
        <Text style={styles.brandName}>Roadalysis</Text>
        <View style={styles.brandStatus}>
          <View style={[
            styles.brandDot,
            {
              backgroundColor:
                status === 'online' ? COLORS.green :
                  status === 'offline' ? COLORS.red :
                    COLORS.yellow,
            }
          ]} />
          <Text style={styles.brandStatusText}>
            {status === 'online'
              ? `Live · ${updated ? formatTime(updated) : ''}`
              : status === 'offline'
                ? 'Demo Mode'
                : 'Connecting...'}
          </Text>
        </View>
      </View>
    </View>
    <View style={styles.brandRight}>
      <TouchableOpacity style={styles.brandBtn} onPress={onInfo}>
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={status === 'online' ? COLORS.green : COLORS.red}
        />
      </TouchableOpacity>
      <TouchableOpacity
  style={[
    styles.brandSyncBtn,
    !liveEnabled && { borderColor: COLORS.red + '55', backgroundColor: COLORS.red + '12' },
  ]}
  onPress={onToggleLive}
>
  <Ionicons
    name={liveEnabled ? 'pause' : 'play'}
    size={13}
    color={liveEnabled ? COLORS.primary : COLORS.red}
  />
  <Text style={[styles.brandSyncText, !liveEnabled && { color: COLORS.red }]}>
    {liveEnabled ? 'Stop GPS' : 'Start GPS'}
  </Text>
</TouchableOpacity>
      <TouchableOpacity style={styles.brandSyncBtn} onPress={onSync}>
        <Ionicons name="sync" size={13} color={COLORS.primary} />
        <Text style={styles.brandSyncText}>Sync</Text>
      </TouchableOpacity>
    </View>
  </View>
));

// ============================================
// DAY/NIGHT TOGGLE
// ============================================
const DayNightToggle = React.memo(({ isDark, onToggle }) => {
  const animValue = useRef(new Animated.Value(isDark ? 0 : 1)).current;

 
  useEffect(() => {
    Animated.spring(animValue, {
      toValue: isDark ? 0 : 1,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
  }, [isDark]);

  const bgColor = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1E1E1E', '#FFF3E0'],
  });

  const thumbPosition = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [3, 33],
  });

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      style={[
        styles.toggleBar,
        !isDark && { backgroundColor: '#ffffffEE', borderColor: '#e0e0e0' },
      ]}
    >
      <Ionicons name="moon" size={14} color={isDark ? COLORS.primaryLight : '#bbb'} style={{ marginRight: 6 }} />
      <Animated.View style={[styles.toggleTrack, { backgroundColor: bgColor }]}>
        <Animated.View style={[
          styles.toggleTrackIcon,
          { left: 6, opacity: animValue.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
        ]}>
          <Text style={{ fontSize: 11 }}>🌙</Text>
        </Animated.View>
        <Animated.View style={[styles.toggleTrackIcon, { right: 6, opacity: animValue }]}>
          <Text style={{ fontSize: 11 }}>☀️</Text>
        </Animated.View>
        <Animated.View style={[
          styles.toggleThumb,
          { transform: [{ translateX: thumbPosition }] },
        ]}>
          <Ionicons name={isDark ? 'moon' : 'sunny'} size={13} color={isDark ? '#FFE082' : '#FF8F00'} />
        </Animated.View>
      </Animated.View>
      <Ionicons name="sunny" size={14} color={!isDark ? '#FF8F00' : '#555'} style={{ marginLeft: 6 }} />
      <Text style={[styles.toggleText, !isDark && { color: '#666' }]}>
        {isDark ? 'Night' : 'Day'}
      </Text>
    </TouchableOpacity>
  );
});

// ============================================
// LOCATION SEARCH
// ============================================
const LocationSearch = React.memo(({ placeholder, dotColor, onSelect, onClear, isDark, zIndex }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);

  const search = async (text) => {
    if (text.length < 3) { setResults([]); setShowDropdown(false); return; }
    setLoading(true);
    try {
      const url = `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(text)}&limit=5&format=json&countrycodes=in`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        if (response.status === 401) Alert.alert('API Key Error', 'Invalid LocationIQ key');
        return;
      }
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        setResults(data);
        setShowDropdown(true);
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    } catch {
      setResults([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  };

  const onChangeText = (text) => {
    setQuery(text);
    clearTimeout(timer.current);
    if (text.length < 3) { setResults([]); setShowDropdown(false); return; }
    timer.current = setTimeout(() => search(text), 600);
  };

  const pickItem = (item) => {
    const shortName = item.display_name?.split(',').slice(0, 2).join(',') || item.display_name;
    setQuery(shortName);
    setShowDropdown(false);
    setResults([]);
    Keyboard.dismiss();
    onSelect({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), name: item.display_name });
  };

  return (
    <View style={[styles.searchContainer, { zIndex: zIndex || 100 }]}>
      <View style={[
        styles.inputBox,
        focused && { borderColor: COLORS.primary },
        !isDark && { backgroundColor: '#f0f0f0', borderColor: focused ? COLORS.primary : '#ddd' },
      ]}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <TextInput
          style={[styles.inputText, !isDark && { color: '#333' }]}
          value={query}
          placeholder={placeholder}
          placeholderTextColor={isDark ? '#555' : '#999'}
          onChangeText={onChangeText}
          onFocus={() => { setFocused(true); if (results.length > 0) setShowDropdown(true); }}
          onBlur={() => { setFocused(false); setTimeout(() => setShowDropdown(false), 200); }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 6 }} />}
        {query.length > 0 && !loading && (
          <TouchableOpacity
            onPress={() => { setQuery(''); setResults([]); setShowDropdown(false); onClear?.(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color={isDark ? '#666' : '#999'} />
          </TouchableOpacity>
        )}
      </View>

      {showDropdown && results.length > 0 && (
        <View style={[
          styles.suggestionDropdown,
          !isDark && { backgroundColor: '#ffffff', borderColor: '#ddd' },
        ]}>
          {results.map((item, index) => (
            <TouchableOpacity
              key={`${item.place_id || index}`}
              onPress={() => pickItem(item)}
              style={[
                styles.suggestionItem,
                index === results.length - 1 && { borderBottomWidth: 0 },
                !isDark && { borderBottomColor: '#eee' },
              ]}
              activeOpacity={0.6}
            >
              <View style={[styles.suggestionIcon, { backgroundColor: dotColor + '22' }]}>
                <Ionicons name="location" size={14} color={dotColor} />
              </View>
              <View style={styles.suggestionTextContainer}>
                <Text style={[styles.suggestionTitle, !isDark && { color: '#333' }]} numberOfLines={1}>
                  {item.display_name?.split(',')[0]}
                </Text>
                <Text style={[styles.suggestionSubtitle, !isDark && { color: '#888' }]} numberOfLines={1}>
                  {item.display_name?.split(',').slice(1, 3).join(',')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={isDark ? '#444' : '#ccc'} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

// ============================================
// TAB BAR
// ============================================
const TabBar = React.memo(({ active, onChange }) => {
  const tabs = [
    { key: 'map', icon: 'map', label: 'Map' },
    { key: 'data', icon: 'list', label: 'Data' },
    { key: 'stats', icon: 'bar-chart', label: 'Stats' },
    { key: 'explore', icon: 'compass', label: 'Explore' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map(t => (
        <TouchableOpacity key={t.key} style={styles.tab} onPress={() => onChange(t.key)}>
          <Ionicons
            name={active === t.key ? t.icon : `${t.icon}-outline`}
            size={20}
            color={active === t.key ? COLORS.primary : '#555'}
          />
          <Text style={[styles.tabText, active === t.key && { color: COLORS.primary }]}>{t.label}</Text>
          {active === t.key && <View style={styles.tabDot} />}
        </TouchableOpacity>
      ))}
    </View>
  );
});

// ============================================
// BADGE
// ============================================
const Badge = React.memo(({ value }) => (
  <View style={[styles.badge, { borderColor: getColor(value), backgroundColor: getColor(value) + '18' }]}>
    <Ionicons name={getIcon(value)} size={10} color={getColor(value)} />
    <Text style={[styles.badgeText, { color: getColor(value) }]}>{getLabel(value)}</Text>
  </View>
));

// ============================================
// MAP SCREEN
// ============================================
const MapScreen = React.memo(({ data, loading }) => {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [route, setRoute] = useState([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [pathStyle, setPathStyle] = useState('dotted');
  const mapRef = useRef();

  const pathData = useMemo(() => buildColoredPath(data), [data]);

  const filteredSegments = useMemo(() => {
    if (selectedFilter === 'ALL') return pathData.segments;
    return pathData.segments.filter(seg => getLabel(seg.jerkValue) === selectedFilter);
  }, [pathData.segments, selectedFilter]);

  const filteredPoints = useMemo(() => {
    if (selectedFilter === 'ALL') return pathData.points;
    return pathData.points.filter(pt => getLabel(pt.jerkValue) === selectedFilter);
  }, [pathData.points, selectedFilter]);

  useEffect(() => {
    if (data.length > 1 && mapRef.current) {
      const coords = data
        .filter(d => d.latitude && d.longitude)
        .map(d => ({ latitude: d.latitude, longitude: d.longitude }));
      if (coords.length > 1) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coords, {
            edgePadding: { top: 280, right: 40, bottom: 100, left: 40 },
            animated: true,
          });
        }, 500);
      }
    }
  }, [data]);

  const getRoute = async () => {
    if (!from || !to) return Alert.alert('Missing', 'Enter both locations');
    setRouteLoading(true);
    Keyboard.dismiss();
    try {
      const r = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline`
      );
      const d = await r.json();
      if (d.routes?.length) {
        const coords = decodePolyline(d.routes[0].geometry);
        setRoute(coords);
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 280, right: 50, bottom: 200, left: 50 },
          animated: true,
        });
      }
    } catch {
      Alert.alert('Error', 'Could not fetch route');
    } finally {
      setRouteLoading(false);
    }
  };

  const filters = ['ALL', 'Good', 'Moderate', 'Bad', 'Severe'];
  const filterColors = {
    ALL: COLORS.primary, Good: COLORS.green,
    Moderate: COLORS.yellow, Bad: COLORS.orange, Severe: COLORS.red,
  };

  const getDashPattern = () => {
    switch (pathStyle) {
      case 'dotted': return [8, 8];
      case 'dashed': return [15, 10];
      case 'morse': return [15, 5, 5, 5];
      case 'solid': return undefined;
      default: return [8, 8];
    }
  };

  const getStrokeWidth = () => {
    switch (pathStyle) {
      case 'dotted': return 5;
      case 'dashed': return 5;
      case 'morse': return 4;
      case 'solid': return 6;
      default: return 5;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={INITIAL_REGION}
        customMapStyle={isDarkMode ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        onPress={() => Keyboard.dismiss()}
      >
        {filteredSegments.map((seg, i) => (
          <React.Fragment key={`seg-${i}`}>
            <Polyline
              coordinates={seg.coordinates}
              strokeWidth={getStrokeWidth() + 4}
              strokeColor={seg.color + '30'}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={seg.coordinates}
              strokeWidth={getStrokeWidth()}
              strokeColor={seg.color}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={getDashPattern()}
            />
          </React.Fragment>
        ))}

        {filteredPoints.map((pt, i) => (
          <React.Fragment key={`pt-${i}`}>
            <Circle
              center={{ latitude: pt.latitude, longitude: pt.longitude }}
              radius={pt.isStart || pt.isEnd ? 35 : 20}
              fillColor={pt.color + '25'}
              strokeColor={pt.color + '50'}
              strokeWidth={1}
            />
            <Circle
              center={{ latitude: pt.latitude, longitude: pt.longitude }}
              radius={pt.isStart || pt.isEnd ? 18 : 10}
              fillColor={pt.color}
              strokeColor={isDarkMode ? '#ffffff80' : '#00000040'}
              strokeWidth={2}
            />
            {(pt.isStart || pt.isEnd) && (
              <Circle
                center={{ latitude: pt.latitude, longitude: pt.longitude }}
                radius={6}
                fillColor="#ffffff"
                strokeColor={pt.color}
                strokeWidth={2}
              />
            )}
          </React.Fragment>
        ))}

        {route.length > 0 && (
          <>
            <Polyline
              coordinates={route}
              strokeWidth={7}
              strokeColor={COLORS.primary + '30'}
              lineCap="round"
            />
            <Polyline
              coordinates={route}
              strokeWidth={3}
              strokeColor={COLORS.primaryLight}
              lineDashPattern={[12, 8]}
              lineCap="round"
            />
          </>
        )}
      </MapView>

      <View style={styles.toggleWrapper}>
        <DayNightToggle isDark={isDarkMode} onToggle={() => setIsDarkMode(prev => !prev)} />
      </View>

      <View style={[
        styles.pathStyleBar,
        !isDarkMode && { backgroundColor: '#ffffffE8', borderColor: '#ddd' },
      ]}>
        {[
          { key: 'dotted', label: '•••' },
          { key: 'dashed', label: '---' },
          { key: 'morse', label: '-•-' },
          { key: 'solid', label: '───' },
        ].map(ps => (
          <TouchableOpacity
            key={ps.key}
            style={[
              styles.pathStyleBtn,
              pathStyle === ps.key && { backgroundColor: COLORS.primary },
              !isDarkMode && pathStyle !== ps.key && { backgroundColor: '#e8e8e8' },
            ]}
            onPress={() => setPathStyle(ps.key)}
          >
            <Text style={[
              styles.pathStyleText,
              pathStyle === ps.key && { color: '#fff' },
              !isDarkMode && pathStyle !== ps.key && { color: '#666' },
            ]}>
              {ps.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[
        styles.legend,
        !isDarkMode && { backgroundColor: '#ffffffE8', borderColor: '#ddd' }
      ]}>
        {[
          { c: COLORS.green, l: 'Good' },
          { c: COLORS.yellow, l: 'Moderate' },
          { c: COLORS.orange, l: 'Bad' },
          { c: COLORS.red, l: 'Severe' },
        ].map(item => (
          <View key={item.l} style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: item.c }]} />
            <Text style={[styles.legendTextMap, !isDarkMode && { color: '#555' }]}>{item.l}</Text>
          </View>
        ))}
      </View>

      <View style={[
        styles.mapBadge,
        !isDarkMode && { backgroundColor: '#ffffffE8', borderColor: '#ddd' }
      ]}>
        <Ionicons name="analytics" size={12} color={COLORS.primary} />
        <Text style={[styles.mapBadgeText, !isDarkMode && { color: '#555' }]}>
          {filteredPoints.length} pts · {filteredSegments.length} segs
        </Text>
      </View>

      {loading && (
        <View style={[styles.mapLoader, !isDarkMode && { backgroundColor: '#ffffffEE' }]}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={{ color: isDarkMode ? '#fff' : '#333', fontSize: 12, marginTop: 4 }}>Loading...</Text>
        </View>
      )}

      {!panelOpen && (
        <TouchableOpacity
          style={[styles.panelToggle, !isDarkMode && { backgroundColor: '#ffffffF0', borderColor: '#ddd' }]}
          onPress={() => setPanelOpen(true)}
        >
          <Ionicons name="search" size={16} color={isDarkMode ? '#fff' : '#333'} />
          <Text style={[styles.panelToggleText, !isDarkMode && { color: '#333' }]}>Search</Text>
        </TouchableOpacity>
      )}

      {panelOpen && (
        <View style={[
          styles.panel,
          !isDarkMode && { backgroundColor: '#ffffffF8', borderColor: '#ddd' }
        ]}>
          <View style={styles.panelHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="navigate-circle" size={18} color={COLORS.primary} />
              <Text style={[styles.panelTitle, !isDarkMode && { color: '#222' }]}>Plan Route</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setPanelOpen(false); Keyboard.dismiss(); }}
              style={[styles.panelCloseBtn, !isDarkMode && { backgroundColor: '#eee' }]}
            >
              <Ionicons name="chevron-up" size={16} color={isDarkMode ? '#888' : '#666'} />
            </TouchableOpacity>
          </View>

          <LocationSearch
            placeholder="From..."
            dotColor={COLORS.green}
            onSelect={setFrom}
            onClear={() => setFrom(null)}
            isDark={isDarkMode}
            zIndex={200}
          />
          <LocationSearch
            placeholder="To..."
            dotColor={COLORS.red}
            onSelect={setTo}
            onClear={() => setTo(null)}
            isDark={isDarkMode}
            zIndex={100}
          />

          <TouchableOpacity
            style={[styles.routeBtn, routeLoading && { opacity: 0.6 }, (!from || !to) && { opacity: 0.5 }]}
            onPress={getRoute}
            disabled={routeLoading || !from || !to}
          >
            {routeLoading ? <ActivityIndicator size="small" color="#fff" />
              : <>
                <Ionicons name="navigate" size={14} color="#fff" />
                <Text style={styles.routeBtnText}>{!from || !to ? 'Select locations' : 'Get Route'}</Text>
              </>}
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {filters.map(f => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.pill,
                  selectedFilter === f && { backgroundColor: filterColors[f], borderColor: filterColors[f] },
                ]}
                onPress={() => setSelectedFilter(f)}
              >
                <Text style={[
                  styles.pillText,
                  selectedFilter === f && { color: '#fff' },
                ]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
});

// ============================================
// DATA SCREEN
// ============================================
const DataScreen = React.memo(({ data, loading, onRefresh, refreshing }) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [filter, setFilter] = useState('ALL');

  const list = useMemo(() => {
    let d = [...data];
    if (filter !== 'ALL') d = d.filter(i => getLabel(i.jerk_value) === filter);
    if (search) d = d.filter(i =>
      i.address?.toLowerCase().includes(search.toLowerCase()) ||
      i.jerk_value?.toString().includes(search));
    if (sort === 'highest') d.sort((a, b) => b.jerk_value - a.jerk_value);
    if (sort === 'lowest') d.sort((a, b) => a.jerk_value - b.jerk_value);
    return d;
  }, [data, filter, search, sort]);

  const renderItem = useCallback(({ item, index }) => (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: getColor(item.jerk_value) }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={[styles.cardIcon, { backgroundColor: getColor(item.jerk_value) + '18' }]}>
            <Ionicons name={getIcon(item.jerk_value)} size={16} color={getColor(item.jerk_value)} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.address || `Point ${index + 1}`}</Text>
            <Text style={styles.cardCoord}>{item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.cardJerk, { color: getColor(item.jerk_value) }]}>{item.jerk_value?.toFixed(2)}</Text>
            <Text style={styles.cardJerkLabel}>jerk</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <Badge value={item.jerk_value} />
          {item.speed > 0 && <Text style={styles.cardSpeed}>🚗 {item.speed?.toFixed(0)} km/h</Text>}
          <Text style={styles.cardTime}>
            {item.timestamp ? `${formatDate(item.timestamp)} · ${formatTime(item.timestamp)}` : ''}
          </Text>
        </View>
      </View>
    </View>
  ), []);

  return (
    <View style={styles.screen}>
      <View style={styles.screenHead}>
        <Ionicons name="list" size={18} color={COLORS.primary} />
        <Text style={styles.screenTitle}>Road Data</Text>
        <Text style={styles.screenCount}>{list.length} records</Text>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={14} color="#555" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          placeholderTextColor="#555"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={14} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8, flexGrow: 0 }}>
        {['ALL', 'Good', 'Moderate', 'Bad', 'Severe'].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.pill, filter === f && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.pillText, filter === f && { color: '#fff' }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {['newest', 'highest', 'lowest'].map(sv => (
          <TouchableOpacity
            key={sv}
            style={[styles.sortPill, sort === sv && { backgroundColor: COLORS.primaryDark }]}
            onPress={() => setSort(sv)}
          >
            <Text style={[styles.sortText, sort === sv && { color: COLORS.primaryLight }]}>
              {sv.charAt(0).toUpperCase() + sv.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.centerText}>Fetching...</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cloud-offline" size={40} color="#444" />
              <Text style={styles.centerText}>No data</Text>
            </View>
          }
        />
      )}
    </View>
  );
});

// ============================================
// STATS SCREEN
// ============================================
const StatsScreen = React.memo(({ data, loading }) => {
  const stats = useMemo(() => {
    const t = data.length;
    if (t === 0) return { total: 0, avg: 0, max: 0, min: 0, good: 0, mod: 0, bad: 0, severe: 0 };
    const j = data.map(d => d.jerk_value);
    return {
      total: t,
      avg: (j.reduce((a, b) => a + b, 0) / t).toFixed(2),
      max: Math.max(...j).toFixed(2),
      min: Math.min(...j).toFixed(2),
      good: data.filter(d => getLabel(d.jerk_value) === 'Good').length,
      mod: data.filter(d => getLabel(d.jerk_value) === 'Moderate').length,
      bad: data.filter(d => getLabel(d.jerk_value) === 'Bad').length,
      severe: data.filter(d => getLabel(d.jerk_value) === 'Severe').length,
    };
  }, [data]);

  const pct = (n) => stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
  const cats = [
    { label: 'Good', count: stats.good, color: COLORS.green, icon: 'checkmark-circle' },
    { label: 'Moderate', count: stats.mod, color: COLORS.yellow, icon: 'alert' },
    { label: 'Bad', count: stats.bad, color: COLORS.orange, icon: 'alert-circle' },
    { label: 'Severe', count: stats.severe, color: COLORS.red, icon: 'warning' },
  ];

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={styles.screenHead}>
        <Ionicons name="bar-chart" size={18} color={COLORS.primary} />
        <Text style={styles.screenTitle}>Statistics</Text>
        <Text style={styles.screenCount}>{stats.total} total</Text>
      </View>

      <View style={styles.statsGrid}>
        {[
          { icon: 'pulse', label: 'Avg', val: stats.avg, color: COLORS.primary },
          { icon: 'arrow-up', label: 'Max', val: stats.max, color: COLORS.red },
          { icon: 'arrow-down', label: 'Min', val: stats.min, color: COLORS.green },
          { icon: 'location', label: 'Total', val: stats.total, color: COLORS.primary },
        ].map(c => (
          <View key={c.label} style={styles.statCard}>
            <Ionicons name={c.icon} size={20} color={c.color} />
            <Text style={styles.statVal}>{c.val}</Text>
            <Text style={styles.statLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Distribution</Text>
        {cats.map(c => (
          <View key={c.label} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name={c.icon} size={13} color={c.color} />
              <Text style={[styles.barLabel, { color: c.color }]}>{c.label}</Text>
              <Text style={styles.barPct}>{c.count} ({pct(c.count)}%)</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct(c.count)}%`, backgroundColor: c.color }]} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Health</Text>
        <View style={styles.healthBar}>
          {cats.map(c => <View key={c.label} style={{ flex: c.count || 0.01, height: 14, backgroundColor: c.color }} />)}
        </View>
        <Text style={styles.healthNote}>
          {stats.good > stats.total * 0.6 ? 'Good condition!'
            : stats.severe > stats.total * 0.3 ? 'Many severe patches.'
              : 'Mixed conditions.'}
        </Text>
      </View>
    </ScrollView>
  );
});

// ============================================
// EXPLORE SCREEN
// ============================================
const ExploreScreen = React.memo(() => (
  <ScrollView style={styles.screen} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
    <View style={styles.hero}>
      <Ionicons name="road" size={80} color={COLORS.primary} />
      <Text style={styles.heroTitle}>Roadalysis</Text>
      <Text style={styles.heroSub}>Real-time road quality analysis with IoT sensors</Text>
    </View>
  </ScrollView>
));

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [tab, setTab] = useState('map');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(null);
  const [status, setStatus] = useState('checking');

  // --- LIVE PIPELINE REFS ---
  const gpsBufferRef = useRef([]);
  const lastNanoTsRef = useRef(null);
  const locationSubRef = useRef(null);
  const pollTimerRef = useRef(null);

  // ✅ downsampling memory
  const lastSentRef = useRef(null); // { t, latitude, longitude }

 const [liveEnabled, setLiveEnabled] = useState(true);

  const DEMO = [
    { id: '1', latitude: 28.4595, longitude: 77.0266, jerk_value: 0.3, address: 'Demo 1', timestamp: new Date().toISOString(), speed: 40 },
    { id: '2', latitude: 28.4605, longitude: 77.0280, jerk_value: 0.7, address: 'Demo 2', timestamp: new Date().toISOString(), speed: 35 },
  ];

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 8000);
      const r = await fetch(`${BACKEND_URL}/api/jerk-data`, { signal: c.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP Error');
      const d = await r.json();
      setData(d);
      setStatus('online');
      setUpdated(new Date());
    } catch (e) {
      setStatus('offline');
      if (data.length === 0) setData(DEMO);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data.length]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(false);
  }, [fetchData]);

  // Pull from backend periodically (for UI)
  useEffect(() => {
    fetchData(true);
    const i = setInterval(() => fetchData(false), LIVE_REFRESH_MS);
    return () => clearInterval(i);
  }, [fetchData]);

  // ✅ LIVE: GPS watch + jerk polling + DOWN-SAMPLED POST
  useEffect(() => {
    if (!liveEnabled) return;

    let cancelled = false;

    async function startGps() {
      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== 'granted') {
          Alert.alert('Permission required', 'Location permission is needed for live GPS+speed.');
          return;
        }

        locationSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 400,
            distanceInterval: 0,
          },
          (pos) => {
            if (cancelled) return;

            const s = {
              t: Date.now(),
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              speed: (pos.coords.speed ?? 0) * 3.6, // km/h
            };

            const buf = gpsBufferRef.current;
            buf.push(s);
            if (buf.length > GPS_BUFFER_MAX) buf.splice(0, buf.length - GPS_BUFFER_MAX);
          }
        );
      } catch (e) {
        // avoid alert loops
      }
    }

    async function pollJerkOnce() {
      try {
        const r = await fetch(`${BRIDGE_URL}/api/latest-jerk`);
        if (!r.ok) return;
        const j = await r.json();

        const nanoTs = j.timestamp;
        if (nanoTs == null) return;

        // Only process if new nano timestamp
        if (lastNanoTsRef.current === nanoTs) return;
        lastNanoTsRef.current = nanoTs;

        const tJerkPhone = j.received_at_ms ? Number(j.received_at_ms) : Date.now();

        const gps = findClosestGpsSample(gpsBufferRef.current, tJerkPhone);
        if (!gps) return;

        const jerk = Number(j.jerk ?? 0);

        // ✅ Downsampling check
        const candidate = {
          t: tJerkPhone,
          latitude: gps.latitude,
          longitude: gps.longitude,
          speed: gps.speed,
        };

        if (!shouldSendPoint({ lastSent: lastSentRef.current, candidate, jerk })) {
          return;
        }

        const payload = {
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          speed: candidate.speed,
          jerk_value: jerk,
          level: jerkLevel(jerk),
          timestamp: new Date(candidate.t).toISOString(),
          t_nano: nanoTs,
          // token: "12345", // only if you enforce it on backend POST
        };

        const resp = await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // Update lastSent only if backend accepted
       if (resp.ok) {
  const prev = lastSentRef.current;

  lastSentRef.current = {
    t: candidate.t,
    latitude: candidate.latitude,
    longitude: candidate.longitude,

    // keep/update event timestamps for cooldown logic
    lastEventT: (jerk >= EVENT_JERK) ? candidate.t : (prev?.lastEventT ?? 0),
    lastSevereT: (jerk >= SEVERE_JERK) ? candidate.t : (prev?.lastSevereT ?? 0),
  };
}
      } catch (e) {
        // ignore to avoid spamming
      }
    }

    startGps();
    pollTimerRef.current = setInterval(pollJerkOnce, POLL_MS);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;

      if (locationSubRef.current) locationSubRef.current.remove();
      locationSubRef.current = null;
    };
  }, [liveEnabled]);

useEffect(() => {
  if (!liveEnabled) {
    gpsBufferRef.current = [];
    lastNanoTsRef.current = null;
    lastSentRef.current = null;
  }
}, [liveEnabled]);

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      <BrandHeader
  status={status}
  updated={updated}
  dataCount={data.length}
  onSync={() => fetchData(true)}
  onInfo={() => Alert.alert('Info', `Backend: ${BACKEND_URL}\nBridge: ${BRIDGE_URL}\nStatus: ${status}\nPoints: ${data.length}\nGPS: ${liveEnabled ? 'ON' : 'OFF'}`)}
  liveEnabled={liveEnabled}
  onToggleLive={() => setLiveEnabled(v => !v)}
/>
      <View style={{ flex: 1 }}>
        {tab === 'map' && <MapScreen data={data} loading={loading} />}
        {tab === 'data' && <DataScreen data={data} loading={loading} onRefresh={onRefresh} refreshing={refreshing} />}
        {tab === 'stats' && <StatsScreen data={data} loading={loading} />}
        {tab === 'explore' && <ExploreScreen />}
      </View>
      <TabBar active={tab} onChange={setTab} />
    </View>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: COLORS.bg },

  brandHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: STATUS_BAR_HEIGHT + 4, paddingBottom: 10, paddingHorizontal: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center' },
  brandLogoCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary + '22',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  brandName: { color: COLORS.text, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  brandStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  brandDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  brandStatusText: { color: '#666', fontSize: 10 },
  brandRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandBtn: { backgroundColor: COLORS.cardLight, padding: 6, borderRadius: 16 },
  brandSyncBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary + '18',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.primary + '44',
  },
  brandSyncText: { color: COLORS.primary, fontSize: 11, fontWeight: '600', marginLeft: 4 },

  toggleWrapper: { position: 'absolute', top: 10, alignSelf: 'center', zIndex: 15 },
  toggleBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card + 'EE',
    borderRadius: 24, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.border,
  },
  toggleTrack: { width: 60, height: 28, borderRadius: 14, justifyContent: 'center', overflow: 'hidden' },
  toggleTrackIcon: { position: 'absolute', top: 5 },
  toggleThumb: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  toggleText: { color: '#999', fontSize: 10, fontWeight: '700', marginLeft: 6, width: 32 },

  pathStyleBar: {
    position: 'absolute', bottom: 50, alignSelf: 'center',
    flexDirection: 'row', backgroundColor: COLORS.card + 'E8',
    borderRadius: 20, padding: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pathStyleBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.cardLight, marginHorizontal: 2,
  },
  pathStyleText: { color: '#888', fontSize: 11, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.card,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabText: { fontSize: 9, marginTop: 2, color: '#555' },
  tabDot: { position: 'absolute', top: -8, width: 20, height: 2.5, backgroundColor: COLORS.primary, borderRadius: 2 },

  panel: {
    position: 'absolute', top: 50, left: 10, right: 10,
    backgroundColor: COLORS.card + 'F8', borderRadius: 16, padding: 14,
    zIndex: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  panelTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  panelCloseBtn: { backgroundColor: COLORS.cardLight, padding: 4, borderRadius: 12 },
  panelToggle: {
    position: 'absolute', top: 50, left: 10, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card + 'F0', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, zIndex: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  panelToggleText: { color: '#ccc', fontSize: 12, marginLeft: 6, fontWeight: '500' },

  searchContainer: { position: 'relative', marginBottom: 6 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardLight,
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  inputText: { flex: 1, color: '#fff', fontSize: 14 },

  suggestionDropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    marginTop: 4, overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  suggestionIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  suggestionTextContainer: { flex: 1, marginLeft: 10 },
  suggestionTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  suggestionSubtitle: { color: '#666', fontSize: 11, marginTop: 1 },

  routeBtn: {
    backgroundColor: COLORS.primary, padding: 11, borderRadius: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
  },
  routeBtnText: { color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 6 },

  pill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    backgroundColor: COLORS.cardLight, marginRight: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  pillText: { color: '#666', fontSize: 11 },

  legend: {
    position: 'absolute', bottom: 16, left: 10, backgroundColor: COLORS.card + 'E8',
    borderRadius: 10, padding: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  legendLine: { width: 16, height: 4, borderRadius: 2, marginRight: 6 },
  legendTextMap: { color: '#999', fontSize: 10 },

  mapBadge: {
    position: 'absolute', bottom: 16, right: 10, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card + 'E8', paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  mapBadgeText: { color: '#aaa', fontSize: 10, marginLeft: 4 },

  mapLoader: {
    position: 'absolute', top: '45%', alignSelf: 'center',
    backgroundColor: COLORS.card + 'EE', padding: 16, borderRadius: 12, alignItems: 'center',
  },

  screen: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 14 },
  screenHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  screenTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 6, flex: 1 },
  screenCount: { color: '#666', fontSize: 11 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    padding: 8, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, color: '#fff', marginLeft: 6, fontSize: 13 },

  sortRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sortLabel: { color: '#555', fontSize: 11, marginRight: 6 },
  sortPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: COLORS.card, marginRight: 6 },
  sortText: { color: '#666', fontSize: 11 },

  card: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12,
    marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  cardAccent: { width: 3 },
  cardBody: { flex: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cardCoord: { color: '#555', fontSize: 10, marginTop: 1 },
  cardJerk: { fontSize: 18, fontWeight: '800' },
  cardJerkLabel: { color: '#555', fontSize: 9 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardSpeed: { color: '#666', fontSize: 10 },
  cardTime: { color: '#555', fontSize: 10 },

  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '600', marginLeft: 3 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  centerText: { color: '#555', marginTop: 12, fontSize: 14 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 },
  statCard: {
    width: '48%', backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  statVal: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 6 },
  statLabel: { color: '#666', fontSize: 11, marginTop: 2 },

  section: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  barLabel: { fontSize: 12, fontWeight: '600', marginLeft: 5, flex: 1 },
  barPct: { color: '#666', fontSize: 11 },
  barTrack: { height: 6, backgroundColor: COLORS.cardLight, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  healthBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 10 },
  healthNote: { color: '#777', fontSize: 12, lineHeight: 17 },

  // Explore
  hero: { alignItems: 'center', paddingVertical: 30 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 12 },
  heroSub: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 18, paddingHorizontal: 20 },
});