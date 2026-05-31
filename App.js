import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';

// ─── NASTAV SVOJU WEBHOOK URL ───────────────────────────────────────────────
const N8N_WEBHOOK_URL = 'https://n8n-prox.pidiman.sk/webhook/send-position';
// ────────────────────────────────────────────────────────────────────────────

const STATUS = {
  IDLE: 'idle',
  LOCATING: 'locating',
  SENDING: 'sending',
  SUCCESS: 'success',
  ERROR: 'error',
};

export default function App() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [lastPosition, setLastPosition] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pulse] = useState(new Animated.Value(1));

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulse.stopAnimation();
    Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const sendPosition = useCallback(async () => {
    if (status === STATUS.LOCATING || status === STATUS.SENDING) return;

    setStatus(STATUS.LOCATING);
    setErrorMsg('');
    startPulse();

    try {
      // 1. Požiadaj o povolenie
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        throw new Error('GPS povolenie zamietnuté. Povolenie udeľ v nastaveniach telefónu.');
      }

      // 2. Zisti polohu
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
      });

      const position = {
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        accuracy: Math.round(loc.coords.accuracy),
        altitude: loc.coords.altitude ? Math.round(loc.coords.altitude) : null,
        speed: loc.coords.speed ? Math.round(loc.coords.speed * 3.6) : null, // m/s → km/h
        timestamp: new Date(loc.timestamp).toISOString(),
        maps_url: `https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`,
      };

      setLastPosition(position);
      setStatus(STATUS.SENDING);

      // 3. Odošli na n8n
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(position),
      });

      if (!response.ok) {
        throw new Error(`Server odpovedal: ${response.status}`);
      }

      stopPulse();
      setStatus(STATUS.SUCCESS);
      setLastSent(new Date().toLocaleTimeString('sk-SK'));

      // Reset po 4 sekundách
      setTimeout(() => setStatus(STATUS.IDLE), 4000);

    } catch (err) {
      stopPulse();
      setErrorMsg(err.message);
      setStatus(STATUS.ERROR);
      setTimeout(() => setStatus(STATUS.IDLE), 5000);
    }
  }, [status]);

  const getButtonColor = () => {
    switch (status) {
      case STATUS.SUCCESS: return '#00c853';
      case STATUS.ERROR:   return '#d32f2f';
      default:             return '#1565c0';
    }
  };

  const getButtonLabel = () => {
    switch (status) {
      case STATUS.LOCATING: return '📡  Zisťujem polohu...';
      case STATUS.SENDING:  return '📤  Odosielam...';
      case STATUS.SUCCESS:  return '✅  Odoslané!';
      case STATUS.ERROR:    return '❌  Chyba';
      default:              return '📍  SEND POSITION';
    }
  };

  const isLoading = status === STATUS.LOCATING || status === STATUS.SENDING;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Position Sender</Text>
        <Text style={styles.headerSub}>n8n • GPS tracker</Text>
      </View>

      {/* Main button */}
      <View style={styles.buttonArea}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: getButtonColor() }]}
            onPress={sendPosition}
            activeOpacity={0.85}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" size="large" />
              : <Text style={styles.mainButtonText}>{getButtonLabel()}</Text>
            }
          </TouchableOpacity>
        </Animated.View>

        {status === STATUS.IDLE && (
          <Text style={styles.hint}>Stlač pre odoslanie GPS polohy emailom</Text>
        )}
        {status === STATUS.ERROR && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
      </View>

      {/* Last position card */}
      {lastPosition && (
        <ScrollView style={styles.card}>
          <Text style={styles.cardTitle}>Posledná poloha</Text>
          <Row label="Lat" value={lastPosition.lat.toFixed(6)} />
          <Row label="Lon" value={lastPosition.lon.toFixed(6)} />
          <Row label="Presnosť" value={`±${lastPosition.accuracy} m`} />
          {lastPosition.altitude != null && (
            <Row label="Nadmorská výška" value={`${lastPosition.altitude} m`} />
          )}
          {lastPosition.speed != null && (
            <Row label="Rýchlosť" value={`${lastPosition.speed} km/h`} />
          )}
          {lastSent && <Row label="Odoslané o" value={lastSent} />}
        </ScrollView>
      )}

      {/* Webhook URL indicator */}
      <View style={styles.footer}>
        <Text style={styles.footerText} numberOfLines={1}>
          🔗 {N8N_WEBHOOK_URL.replace('https://', '').substring(0, 40)}…
        </Text>
      </View>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 40,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  buttonArea: {
    alignItems: 'center',
    marginBottom: 36,
  },
  mainButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#1565c0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 16,
    letterSpacing: 0.5,
  },
  hint: {
    color: '#444',
    fontSize: 13,
    marginTop: 20,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff5252',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
    maxWidth: 280,
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222',
    maxHeight: 220,
  },
  cardTitle: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  rowLabel: {
    color: '#555',
    fontSize: 13,
  },
  rowValue: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
  },
  footerText: {
    color: '#333',
    fontSize: 11,
    textAlign: 'center',
  },
});
