export interface Track {
  id: string;
  callsign: string;
  source: string;
  vehicleType: string;
  classification: string;
  affiliation: string;
  status: string;
  alertLevel: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  speedMetersPerSecond: number;
  groundSpeedMetersPerSecond?: number;
  verticalSpeedMetersPerSecond?: number;
  batteryMinutes?: number;
  headingDegrees: number;
  confidence: number;
  behavior: string;
  commandLatitude?: number;
  commandLongitude?: number;
  commandTargetTrackId?: string;
  commandRadiusMeters?: number;
  commandCruiseAltitudeMeters?: number;
  commandEffectiveRangeMeters?: number;
  lastUpdateUtc: string;
}

export interface ProtectedSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  posture: string;
}

export interface CommandDefinition {
  id: string;
  label: string;
  intent: string;
  category: string;
}

export interface OperatorActionLogEntry {
  id: string;
  timestampUtc: string;
  trackId: string;
  commandId: string;
  commandLabel: string;
  notes: string;
  operator: string;
}

export interface TransportStatus {
  tcpPort: number;
  listenerOnline: boolean;
  connectedClients: number;
  lastMessageUtc?: string;
  lastError: string;
}

export interface AirPictureSnapshot {
  generatedAtUtc: string;
  tracks: Track[];
  protectedSites: ProtectedSite[];
  availableCommands: CommandDefinition[];
  actionLog: OperatorActionLogEntry[];
  transportStatus: TransportStatus;
}

export interface OperatorActionRequest {
  trackId: string;
  commandId: string;
  notes: string;
  operator: string;
}

export interface CreateGeofenceRequest {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  posture: string;
}

export interface UpdateGeofenceRequest {
  name: string;
  radiusMeters: number;
  posture: string;
}

export interface CreateSimulatorTrackRequest {
  callsign: string;
  vehicleType: string;
  classification: string;
  affiliation: string;
  alertLevel: string;
  status: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  speedMetersPerSecond: number;
  batteryMinutes: number;
  headingDegrees: number;
}

export interface TrackUpdateRequest {
  vehicleType: string;
  classification: string;
  affiliation: string;
  alertLevel: string;
  status: string;
  operator: string;
  notes: string;
}

export interface TrackBehaviorOrderRequest {
  behavior: string;
  latitude?: number;
  longitude?: number;
  targetTrackId?: string;
  standoffRadiusMeters?: number;
  cruiseAltitudeMeters?: number;
  operator: string;
  notes: string;
  optimizeAltitude?: boolean;
}

export interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  currentTemperatureC: number;
  currentWindSpeedMs: number;
  currentWindDirectionDegrees: number;
  currentCloudCoverPercent: number;
  altitudeWindSpeedMs: number;
  altitudeWindDirectionDegrees: number;
  altitudeCloudCoverPercent: number;
  altitudeLayerMeters: number;
  lowCloudCoverPercent: number;
  midCloudCoverPercent: number;
  highCloudCoverPercent: number;
  layers: WeatherLayerSnapshot[];
  source: string;
  generatedAtUtc: string;
}

export interface WeatherLayerSnapshot {
  id: string;
  altitudeMeters: number;
  windSpeedMs: number;
  windDirectionDegrees: number;
  cloudCoverPercent?: number;
}
