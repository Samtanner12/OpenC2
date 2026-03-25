import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AirPictureSnapshot,
  CreateSimulatorTrackRequest,
  CreateGeofenceRequest,
  OperatorActionLogEntry,
  OperatorActionRequest,
  ProtectedSite,
  Track,
  TrackBehaviorOrderRequest,
  TrackUpdateRequest,
  WeatherSnapshot,
  UpdateGeofenceRequest
} from '../models/c2.models';

@Injectable({ providedIn: 'root' })
export class AirPictureService {
  constructor(private readonly http: HttpClient) {}

  getSnapshot(): Observable<AirPictureSnapshot> {
    return this.http.get<AirPictureSnapshot>('/api/air-picture');
  }

  getWeather(latitude: number, longitude: number, altitudeMeters: number): Observable<WeatherSnapshot> {
    return this.http.get<WeatherSnapshot>(
      `/api/air-picture/weather?latitude=${latitude}&longitude=${longitude}&altitudeMeters=${altitudeMeters}`
    );
  }

  recordAction(request: OperatorActionRequest): Observable<OperatorActionLogEntry> {
    return this.http.post<OperatorActionLogEntry>('/api/air-picture/actions', request);
  }

  createGeofence(request: CreateGeofenceRequest): Observable<ProtectedSite> {
    return this.http.post<ProtectedSite>('/api/air-picture/geofences', request);
  }

  createSimulatorTrack(request: CreateSimulatorTrackRequest): Observable<Track> {
    return this.http.post<Track>('/api/air-picture/tracks', request);
  }

  deleteTrack(trackId: string): Observable<void> {
    return this.http.delete<void>(`/api/air-picture/tracks/${trackId}`);
  }

  orderTrackBehavior(trackId: string, request: TrackBehaviorOrderRequest): Observable<Track> {
    return this.http.post<Track>(`/api/air-picture/tracks/${trackId}/behavior`, request);
  }

  updateGeofence(siteId: string, request: UpdateGeofenceRequest): Observable<ProtectedSite> {
    return this.http.put<ProtectedSite>(`/api/air-picture/geofences/${siteId}`, request);
  }

  updateTrack(trackId: string, request: TrackUpdateRequest): Observable<Track> {
    return this.http.put<Track>(`/api/air-picture/tracks/${trackId}`, request);
  }
}
