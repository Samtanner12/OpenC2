import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import ms from 'milsymbol';
import {
  AirPictureSnapshot,
  CommandDefinition,
  CreateSimulatorTrackRequest,
  CreateGeofenceRequest,
  OperatorActionLogEntry,
  OperatorActionRequest,
  ProtectedSite,
  Track,
  TrackBehaviorOrderRequest,
  TrackUpdateRequest,
  WeatherLayerSnapshot,
  WeatherSnapshot,
  UpdateGeofenceRequest
} from './models/c2.models';
import { AirPictureService } from './services/air-picture.service';
import { AirPictureStreamService } from './services/air-picture-stream.service';

const defaultCesiumIonAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1MjhhMzE0Ny1iMTczLTRmZjQtODNiZS0xYmQ3NjNmYjQ2OTUiLCJpZCI6MjYyMDUwLCJpYXQiOjE3MzQwMjc4MTR9.2tszeHFsmfiYbOdBNJcZle3sxC5506HEwwJ50lBvaIM';
const googleSatelliteImageryAssetId = 3830182;
const googleSatelliteLabelsImageryAssetId = 3830183;
const googleRoadmapImageryAssetId = 3830184;
const googleLabelsOnlyImageryAssetId = 3830185;
const googleContourImageryAssetId = 3830186;
const cesiumWorldTerrainAssetId = 1;
const cesiumOsmBuildingsAssetId = 96188;
const arcgisWorldElevationUrl =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';

type WorkspaceTab = 'contacts' | 'sites' | 'transport';
type RightPaneTab = 'actions' | 'details' | 'activity';

interface QuickActionPreset {
  commandId: string;
  label: string;
  detail: string;
}

interface GeoBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  lonSpan: number;
  latSpan: number;
}

interface CesiumBootstrapSettings {
  cesiumIonAccessToken?: string;
}

interface GlobeBaseLayerSelection {
  baseLayer: any;
  label: string;
}

interface GeofencePreviewLocation {
  latitude: number;
  longitude: number;
}

interface SimulatorTrackDraft {
  callsign: string;
  vehicleType: string;
  classification: string;
  affiliation: string;
  alertLevel: string;
  status: string;
  altitudeMeters: number;
  speedMetersPerSecond: number;
  batteryMinutes: number;
  headingDegrees: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface PendingBehaviorOrder {
  trackId: string;
  behavior: string;
  latitude?: number;
  longitude?: number;
  projectedRangeMeters: number;
  destinationDistanceMeters: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('fallbackViewport') fallbackViewport?: ElementRef<HTMLDivElement>;

  public snapshot?: AirPictureSnapshot;
  public selectedTrackId = '';
  public selectedSiteId = '';
  public selectedCommandId = '';
  public operatorName = 'Control Alpha';
  public actionNotes = '';
  public loading = true;
  public transportSummary = 'Awaiting transport state...';
  public globeReady = false;
  public globeError = '';
  public globeMode: '3d' | 'fallback' = '3d';
  public dismissGlobeOverlay = false;
  public targetLock = false;
  public fallbackScale = 1;
  public fallbackOffsetX = 0;
  public fallbackOffsetY = 0;
  public readonly title = 'OpenC2 Mission Console';
  public workspaceTab: WorkspaceTab = 'contacts';
  public rightPaneTab: RightPaneTab = 'actions';
  public signalrOnline = false;
  public leftPanelHidden = false;
  public rightPanelHidden = false;
  public showMissionHud = true;
  public showTipHud = true;
  public geofenceName = 'Ad hoc geofence';
  public geofenceRadiusMeters = 1200;
  public geofencePlacementArmed = false;
  public showTrackCreator = false;
  public trackPlacementActive = false;
  public creatingSimulatorTrack = false;
  public simulatorTrackDraft: SimulatorTrackDraft = this.createDefaultSimulatorTrackDraft();
  public behaviorTargetTrackId = '';
  public behaviorRadiusMeters = 180;
  public behaviorCruiseAltitudeMeters?: number;
  public editSiteName = '';
  public editSiteRadiusMeters = 1200;
  public editSitePosture = 'Geofence';
  public reclassifyVehicleType = '';
  public reclassifyClassification = '';
  public reclassifyAffiliation = '';
  public reclassifyAlertLevel = '';
  public reclassifyStatus = '';
  public renderModeLabel: '3D Globe' | '2D Tactical' = '3D Globe';
  public imageryLabel = 'Google Satellite';
  public terrainLabel = 'Terrain pending';
  public cameraTiltDegrees = 62;
  public cameraHeadingDegrees = 0;
  public currentTimeMs = Date.now();
  public weatherVisible = true;
  public weatherSnapshot?: WeatherSnapshot;
  public pendingBehaviorOrder?: PendingBehaviorOrder;
  public readonly classificationOptions = ['Pending', 'Unknown', 'Assumed Friend', 'Friendly', 'Neutral', 'Suspect', 'Hostile'];
  public readonly affiliationOptions = ['Friendly', 'Hostile', 'Neutral', 'Unknown', 'Suspect'];
  public readonly alertLevelOptions = ['Low', 'Elevated', 'High'];
  public readonly statusOptions = ['Tracking', 'Monitoring', 'Investigating', 'Shadowing', 'Reclassified', 'Engaged'];
  public readonly vehicleTypeOptions = ['Quadcopter', 'Fixed Wing', 'Helicopter', 'Ground Vehicle', 'Unknown'];
  public readonly sitePostureOptions = ['Protected', 'Observe', 'Geofence', 'Warning', 'Restricted'];
  public readonly behaviorOptions = ['Guard', 'Move To Position', 'Random', 'Surveil Location', 'Surveil Track', 'Engage Track'];

  public readonly quickActionPresets: QuickActionPreset[] = [
    { commandId: 'surveil', label: 'Surveil', detail: 'Task persistent collection against the selected contact.' },
    { commandId: 'reclassify', label: 'Reclassify', detail: 'Update identification, affiliation, and threat posture.' },
    { commandId: 'shadow', label: 'Shadow', detail: 'Assign continued sensor coverage and movement watch.' },
    { commandId: 'geofence', label: 'Geofence', detail: 'Assess against protected-site exclusion and warning rings.' },
    { commandId: 'dispatch', label: 'Dispatch', detail: 'Notify a non-kinetic response team for field intercept.' },
    { commandId: 'handoff', label: 'Handoff', detail: 'Transfer track control to another desk or external cell.' },
    { commandId: 'corridor', label: 'Corridor', detail: 'Declare a protected corridor around the active area.' }
  ];

  private viewer?: any;
  private cesium?: any;
  private entityClickHandler?: any;
  private buildingsTileset?: any;
  private readonly destroy$ = new Subject<void>();
  private isDraggingFallback = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginX = 0;
  private dragOriginY = 0;
  private cameraRangeMeters = 18000;
  private geofencePreviewLocation?: GeofencePreviewLocation;
  private readonly geofencePreviewEntityId = 'geofence-preview';
  private trackPlacementPreviewLocation?: GeofencePreviewLocation;
  public trackPlacementPreviewScreen?: ScreenPoint;
  private readonly trackPlacementPreviewEntityId = 'track-placement-preview';
  public behaviorPlacementMode: 'Move To Position' | 'Surveil Location' | null = null;
  private behaviorPlacementTrackId = '';
  private behaviorPlacementPreviewLocation?: GeofencePreviewLocation;
  public behaviorPlacementPreviewScreen?: ScreenPoint;
  private readonly behaviorPlacementPreviewEntityId = 'behavior-placement-preview';
  private readonly trackHistory = new Map<string, Array<{ latitude: number; longitude: number }>>();
  private readonly milStdSymbolCache = new Map<string, HTMLCanvasElement>();
  private readonly weatherSnapshotsByTrackId = new Map<string, WeatherSnapshot>();
  private readonly trackVisualStateById = new Map<string, string>();
  private readonly trackLabelStateById = new Map<string, string>();
  private readonly terrainHeightByCellKey = new Map<string, number>();
  private readonly lastWeatherFetchAtMsByTrackId = new Map<string, number>();
  private commandOverlayEntityIds = new Set<string>();
  private hydratedTrackFormId = '';
  private hydratedSiteFormId = '';
  private ageRefreshTimerId?: number;

  constructor(
    private readonly airPictureService: AirPictureService,
    private readonly airPictureStreamService: AirPictureStreamService
  ) {}

  ngOnInit(): void {
    this.ageRefreshTimerId = window.setInterval(() => {
      this.currentTimeMs = Date.now();
    }, 1000);

    this.airPictureService.getSnapshot()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (snapshot) => this.applySnapshot(snapshot),
        error: (error) => {
          console.error(error);
          this.loading = false;
          this.transportSummary = 'API unavailable. Start the ASP.NET backend to populate the console.';
        }
      });

    this.airPictureStreamService.connect()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (snapshot) => {
          this.signalrOnline = true;
          this.applySnapshot(snapshot);
        },
        error: (error) => {
          console.error(error);
          this.signalrOnline = false;
          this.transportSummary = 'Live stream unavailable. Initial snapshot loaded, but SignalR updates failed.';
        }
      });
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      this.cesium = await import('cesium');
      const ionToken = this.getCesiumIonAccessToken();
      if (ionToken) {
        this.cesium.Ion.defaultAccessToken = ionToken;
      }

      if (!this.canInitializeWebGl()) {
        this.globeMode = 'fallback';
        this.globeReady = true;
        this.dismissGlobeOverlay = true;
        this.globeError = '3D globe unavailable on this machine. Fallback tactical view active.';
        return;
      }

      const baseLayerSelection = await this.createBaseLayer();

      this.viewer = new this.cesium.Viewer('globe', {
        animation: false,
        baseLayer: baseLayerSelection.baseLayer,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        shouldAnimate: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity
      });
      this.imageryLabel = baseLayerSelection.label;

      await this.configureTerrain();

      this.viewer.scene.globe.enableLighting = false;
      this.viewer.scene.globe.depthTestAgainstTerrain = false;
      this.viewer.scene.globe.maximumScreenSpaceError = 1.25;
      this.viewer.scene.skyAtmosphere.hueShift = 0.15;
      this.viewer.scene.postProcessStages.fxaa.enabled = true;
      this.viewer.scene.fog.enabled = false;
      this.viewer.scene.backgroundColor = this.cesium.Color.fromCssColorString('#03070d');
      this.viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
      this.viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
      this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 150;
      this.viewer.scene.screenSpaceCameraController.maximumZoomDistance = 20000000;
      this.viewer.scene.renderError.addEventListener((sceneError: unknown) => {
        console.error(sceneError);
        this.switchToFallback('3D rendering became unavailable in Chrome. Tactical map fallback active.');
      });

      try {
        if (ionToken) {
          this.buildingsTileset = await this.cesium.Cesium3DTileset.fromIonAssetId(cesiumOsmBuildingsAssetId, {
            maximumScreenSpaceError: 24,
            dynamicScreenSpaceError: true,
            skipLevelOfDetail: true,
            preferLeaves: true
          });
          this.viewer.scene.primitives.add(this.buildingsTileset);
          this.imageryLabel = `${this.imageryLabel} + Buildings`;
        }
      } catch (buildingsError) {
        console.warn('3D building tiles could not be loaded.', buildingsError);
      }

      this.flyCameraToLocation(-104.9903, 39.7392, 18000);

      this.entityClickHandler = new this.cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
      this.entityClickHandler.setInputAction((movement: { position: unknown }) => {
        if (this.behaviorPlacementMode && this.behaviorPlacementTrackId) {
          const location = this.resolveGlobeLocation(movement.position);
          if (location) {
            this.behaviorPlacementPreviewLocation = location;
            this.submitBehaviorOrder(
              this.behaviorPlacementTrackId,
              this.behaviorPlacementMode,
              location.latitude,
              location.longitude
            );
          }
          return;
        }

        if (this.trackPlacementActive) {
          const location = this.resolveGlobeLocation(movement.position);
          if (location) {
            this.trackPlacementPreviewLocation = location;
            this.createSimulatorTrackAtLocation(location.latitude, location.longitude);
          }
          return;
        }

        if (this.geofencePlacementArmed) {
          this.handle3dGeofencePlacement(movement.position);
          return;
        }

        const picked = this.viewer?.scene.pick(movement.position);
        const entityId = picked?.id?.id;
        if (typeof entityId === 'string' && entityId.startsWith('trk-')) {
          this.focusTrack(entityId);
          return;
        }

        if (typeof entityId === 'string' && entityId.startsWith('site-')) {
          this.focusSite(entityId);
        }
      }, this.cesium.ScreenSpaceEventType.LEFT_CLICK);
      this.entityClickHandler.setInputAction((movement: { endPosition: unknown }) => {
        if (this.behaviorPlacementMode && movement.endPosition) {
          const location = this.resolveGlobeLocation(movement.endPosition);
          if (location) {
            this.behaviorPlacementPreviewLocation = location;
            this.syncBehaviorPlacementPreviewEntity();
          }
        }

        if (this.trackPlacementActive && movement.endPosition) {
          const location = this.resolveGlobeLocation(movement.endPosition);
          if (location) {
            this.trackPlacementPreviewLocation = location;
            this.syncTrackPlacementPreviewEntity();
          }
        }

        if (this.geofencePlacementArmed) {
          this.update3dGeofencePreview(movement.endPosition);
        }
      }, this.cesium.ScreenSpaceEventType.MOUSE_MOVE);

      this.viewer.scene.canvas.addEventListener('webglcontextlost', (event: Event) => {
        event.preventDefault();
        this.switchToFallback('3D context lost in the browser. Fallback tactical view active.');
      });

      this.globeMode = '3d';
      this.renderModeLabel = '3D Globe';
      this.globeReady = true;
      this.dismissGlobeOverlay = false;
      setTimeout(() => this.handleResize(), 0);
      this.renderScene();
    } catch (error) {
      console.error(error);
      this.switchToFallback('3D globe unavailable on this machine. Fallback tactical view active.');
    }
  }

  private getCesiumIonAccessToken(): string {
    const runtimeSettings = (window as Window & { __OPENC2_CONFIG__?: CesiumBootstrapSettings }).__OPENC2_CONFIG__;
    return runtimeSettings?.cesiumIonAccessToken?.trim() || defaultCesiumIonAccessToken;
  }

  private async createBaseLayer(): Promise<GlobeBaseLayerSelection> {
    const baseLayerCandidates: Array<() => Promise<GlobeBaseLayerSelection>> = [
      async () => ({
        baseLayer: this.cesium.ImageryLayer.fromProviderAsync(
          this.cesium.IonImageryProvider.fromAssetId(googleSatelliteLabelsImageryAssetId)
        ),
        label: 'Google Satellite with Labels'
      }),
      async () => ({
        baseLayer: this.cesium.ImageryLayer.fromProviderAsync(
          this.cesium.IonImageryProvider.fromAssetId(googleSatelliteImageryAssetId)
        ),
        label: 'Google Satellite'
      }),
      async () => ({
        baseLayer: this.cesium.ImageryLayer.fromProviderAsync(
          this.cesium.IonImageryProvider.fromAssetId(googleRoadmapImageryAssetId)
        ),
        label: 'Google Roadmap'
      }),
      async () => ({
        baseLayer: this.cesium.ImageryLayer.fromProviderAsync(
          this.cesium.IonImageryProvider.fromAssetId(googleLabelsOnlyImageryAssetId)
        ),
        label: 'Google Labels'
      }),
      async () => ({
        baseLayer: this.cesium.ImageryLayer.fromProviderAsync(
          this.cesium.IonImageryProvider.fromAssetId(googleContourImageryAssetId)
        ),
        label: 'Google Contour'
      }),
      async () => ({
        baseLayer: this.cesium.ImageryLayer.fromWorldImagery(),
        label: 'Cesium World Imagery'
      }),
      async () => ({
        baseLayer: new this.cesium.ImageryLayer(new this.cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/'
        })),
        label: 'OpenStreetMap'
      }),
      async () => ({
        baseLayer: this.cesium.ImageryLayer.fromProviderAsync(
          this.cesium.TileMapServiceImageryProvider.fromUrl(
            this.cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
          )
        ),
        label: 'Natural Earth'
      })
    ];

    for (const createCandidate of baseLayerCandidates) {
      try {
        const selection = await createCandidate();
        this.attachImageryDiagnostics(selection.baseLayer, selection.label);
        return selection;
      } catch (error) {
        console.warn('Cesium imagery source failed during initialization.', error);
      }
    }

    throw new Error('No imagery layer could be initialized for the Cesium globe.');
  }

  private async configureTerrain(): Promise<void> {
    if (!this.viewer || !this.cesium) {
      return;
    }

    try {
      this.viewer.terrainProvider = await this.cesium.CesiumTerrainProvider.fromIonAssetId(cesiumWorldTerrainAssetId, {
        requestVertexNormals: true,
        requestWaterMask: true
      });
      this.terrainLabel = 'Cesium World Terrain';
      this.attachTerrainDiagnostics(this.viewer.terrainProvider, this.terrainLabel);
      return;
    } catch (terrainError) {
      console.warn('Cesium World Terrain could not be loaded.', terrainError);
    }

    try {
      this.viewer.terrainProvider = await this.cesium.ArcGISTiledElevationTerrainProvider.fromUrl(arcgisWorldElevationUrl);
      this.terrainLabel = 'ArcGIS World Elevation';
      this.attachTerrainDiagnostics(this.viewer.terrainProvider, this.terrainLabel);
      return;
    } catch (terrainError) {
      console.warn('ArcGIS terrain could not be loaded, using ellipsoid fallback.', terrainError);
    }

    this.viewer.terrainProvider = new this.cesium.EllipsoidTerrainProvider();
    this.terrainLabel = 'Ellipsoid Fallback';
  }

  private attachImageryDiagnostics(imageryLayer: any, label: string): void {
    imageryLayer?.readyEvent?.addEventListener((provider: any) => {
      provider?.errorEvent?.addEventListener((error: unknown) => {
        console.warn(`${label} tile request failed.`, error);
      });
      this.viewer?.scene.requestRender();
    });

    imageryLayer?.errorEvent?.addEventListener((error: unknown) => {
      console.warn(`${label} imagery layer could not be created.`, error);
    });
  }

  private attachTerrainDiagnostics(terrainProvider: any, label: string): void {
    terrainProvider?.errorEvent?.addEventListener((error: unknown) => {
      console.warn(`${label} tile request failed.`, error);
    });
  }

  private flyCameraToLocation(longitude: number, latitude: number, altitudeMeters: number): void {
    if (!this.viewer || !this.cesium) {
      return;
    }

    this.cameraRangeMeters = altitudeMeters;
    this.viewer.camera.flyTo({
      destination: this.cesium.Cartesian3.fromDegrees(longitude, latitude, altitudeMeters),
      orientation: {
        heading: this.cesium.Math.toRadians(this.cameraHeadingDegrees),
        pitch: this.cesium.Math.toRadians(-this.cameraTiltDegrees),
        roll: 0
      }
    });
  }

  private flyCameraToTrack(track: Track): void {
    this.cameraRangeMeters = Math.max(track.altitudeMeters * 28, 7000);
    this.flyCameraToLocation(track.longitude, track.latitude, this.cameraRangeMeters);
  }

  private refocusCameraOnCurrentTarget(): void {
    if (this.globeMode !== '3d') {
      return;
    }

    const track = this.selectedTrack;
    if (this.targetLock && track) {
      this.orbitAroundTrack(track);
      return;
    }

    const freeFocusTarget = this.getCurrentViewTarget() ?? this.cesium.Cartesian3.fromDegrees(-104.9903, 39.7392, 0);
    this.orbitAroundPosition(freeFocusTarget);
  }

  private orbitAroundTrack(track: Track): void {
    if (!this.viewer || !this.cesium) {
      return;
    }

    const trackedHeight = Math.max(track.altitudeMeters, 120) + 180;
    const target = this.cesium.Cartesian3.fromDegrees(track.longitude, track.latitude, trackedHeight);
    this.viewer.camera.lookAt(
      target,
      new this.cesium.HeadingPitchRange(
        this.cesium.Math.toRadians(this.cameraHeadingDegrees),
        this.cesium.Math.toRadians(-Math.min(this.cameraTiltDegrees, 89)),
        this.cameraRangeMeters
      )
    );
    this.viewer.camera.lookAtTransform(this.cesium.Matrix4.IDENTITY);
    this.viewer.scene.requestRender();
  }

  private orbitAroundPosition(target: any): void {
    if (!this.viewer || !this.cesium) {
      return;
    }

    const currentDistance = this.cesium.Cartesian3.distance(this.viewer.camera.positionWC, target);
    this.cameraRangeMeters = Math.max(500, currentDistance || this.cameraRangeMeters || 18000);
    this.viewer.camera.lookAt(
      target,
      new this.cesium.HeadingPitchRange(
        this.cesium.Math.toRadians(this.cameraHeadingDegrees),
        this.cesium.Math.toRadians(-Math.min(this.cameraTiltDegrees, 89)),
        this.cameraRangeMeters
      )
    );
    this.viewer.camera.lookAtTransform(this.cesium.Matrix4.IDENTITY);
    this.viewer.scene.requestRender();
  }

  private getCurrentViewTarget(): any | undefined {
    if (!this.viewer || !this.cesium) {
      return undefined;
    }

    const canvas = this.viewer.scene.canvas;
    const center = new this.cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const ray = this.viewer.camera.getPickRay(center);
    if (!ray) {
      return undefined;
    }

    return this.viewer.scene.globe.pick(ray, this.viewer.scene);
  }

  public closeGlobeOverlay(): void {
    this.dismissGlobeOverlay = true;
  }

  private switchToFallback(message: string): void {
    const alreadyFallback = this.globeMode === 'fallback';
    this.globeMode = 'fallback';
    this.renderModeLabel = '2D Tactical';
    this.globeReady = true;
    this.dismissGlobeOverlay = true;
    this.globeError = message;
    if (this.entityClickHandler) {
      this.entityClickHandler.destroy();
      this.entityClickHandler = undefined;
    }
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = undefined;
    }
    this.buildingsTileset = undefined;
    if (!alreadyFallback) {
      setTimeout(() => this.centerOnSelectedTarget(), 0);
    }
  }

  public toggleLeftPanel(): void {
    this.leftPanelHidden = !this.leftPanelHidden;
  }

  public toggleRightPanel(): void {
    this.rightPanelHidden = !this.rightPanelHidden;
  }

  public closeMissionHud(): void {
    this.showMissionHud = false;
  }

  public closeTipHud(): void {
    this.showTipHud = false;
  }

  public toggleTargetLock(): void {
    this.targetLock = !this.targetLock;
    if (this.targetLock) {
      if (this.selectedTrack) {
        this.cameraRangeMeters = Math.max(this.selectedTrack.altitudeMeters * 28, 7000);
      }
      this.centerOnSelectedTarget();
      this.refocusCameraOnCurrentTarget();
    }
  }

  public adjustTilt(deltaDegrees: number): void {
    this.cameraTiltDegrees = Math.max(0, Math.min(89, this.cameraTiltDegrees + deltaDegrees));
    if (this.targetLock && this.selectedTrack) {
      this.orbitAroundTrack(this.selectedTrack);
      return;
    }

    const freeFocusTarget = this.getCurrentViewTarget();
    if (freeFocusTarget) {
      this.orbitAroundPosition(freeFocusTarget);
    }
  }

  public adjustRotate(deltaDegrees: number): void {
    this.cameraHeadingDegrees = ((this.cameraHeadingDegrees + deltaDegrees) % 360 + 360) % 360;
    if (this.targetLock && this.selectedTrack) {
      this.orbitAroundTrack(this.selectedTrack);
      return;
    }

    const freeFocusTarget = this.getCurrentViewTarget();
    if (freeFocusTarget) {
      this.orbitAroundPosition(freeFocusTarget);
    }
  }

  public resetView(): void {
    this.cameraTiltDegrees = 62;
    this.cameraHeadingDegrees = 0;
    if (this.targetLock && this.selectedTrack) {
      this.cameraRangeMeters = Math.max(this.selectedTrack.altitudeMeters * 28, 7000);
      this.orbitAroundTrack(this.selectedTrack);
      return;
    }

    this.flyCameraToLocation(-104.9903, 39.7392, 18000);
  }

  public toggleGeofencePlacement(): void {
    this.geofencePlacementArmed = !this.geofencePlacementArmed;
    if (!this.geofencePlacementArmed) {
      this.geofencePreviewLocation = undefined;
      this.syncGeofencePreviewEntity();
      return;
    }

    this.update3dGeofencePreviewFromCenter();
  }

  public openTrackCreator(): void {
    if (!this.canCreateSimulatorTracks) {
      return;
    }

    this.showTrackCreator = true;
  }

  public closeTrackCreator(): void {
    this.showTrackCreator = false;
  }

  public beginSimulatorTrackDrag(event: DragEvent): void {
    if (!this.canCreateSimulatorTracks) {
      event.preventDefault();
      return;
    }

    this.trackPlacementActive = true;
    this.trackPlacementPreviewLocation = undefined;
    this.trackPlacementPreviewScreen = undefined;
    this.showTrackCreator = false;
    this.geofencePlacementArmed = false;
    this.geofencePreviewLocation = undefined;
    this.syncGeofencePreviewEntity();
    this.endBehaviorPlacement();
    event.dataTransfer?.setData('text/plain', 'simulator-track');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
    this.syncTrackPlacementPreviewEntity();
  }

  public endSimulatorTrackDrag(): void {
    this.trackPlacementActive = false;
    this.trackPlacementPreviewLocation = undefined;
    this.trackPlacementPreviewScreen = undefined;
    this.syncTrackPlacementPreviewEntity();
  }

  public handleTrackPlacementDragOver(event: DragEvent): void {
    if (!this.trackPlacementActive && !this.behaviorPlacementMode) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    if (this.trackPlacementActive) {
      this.updateTrackPlacementPreviewFromClient(event.clientX, event.clientY);
    }
    if (this.behaviorPlacementMode) {
      this.updateBehaviorPlacementPreviewFromClient(event.clientX, event.clientY);
    }
  }

  public handleTrackPlacementDrop(event: DragEvent): void {
    if (this.trackPlacementActive || this.behaviorPlacementMode) {
      event.preventDefault();
      if (this.trackPlacementActive) {
        this.updateTrackPlacementPreviewFromClient(event.clientX, event.clientY);
      }
      if (this.behaviorPlacementMode) {
        this.updateBehaviorPlacementPreviewFromClient(event.clientX, event.clientY);
      }
    }
  }

  public handleTrackPlacementDragLeave(event: DragEvent): void {
    if (!this.trackPlacementActive && !this.behaviorPlacementMode) {
      return;
    }

    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    this.trackPlacementPreviewScreen = undefined;
    this.trackPlacementPreviewLocation = undefined;
    this.syncTrackPlacementPreviewEntity();
    this.behaviorPlacementPreviewScreen = undefined;
    this.behaviorPlacementPreviewLocation = undefined;
    this.syncBehaviorPlacementPreviewEntity();
  }

  public handleStageMouseMove(event: MouseEvent): void {
    this.moveFallbackDrag(event);
    if (this.behaviorPlacementMode) {
      this.updateBehaviorPlacementPreviewFromClient(event.clientX, event.clientY);
    }
    if (!this.trackPlacementActive) {
      return;
    }

    this.updateTrackPlacementPreviewFromClient(event.clientX, event.clientY);
  }

  public beginBehaviorPlacement(
    mode: 'Move To Position' | 'Surveil Location',
    event: DragEvent
  ): void {
    const track = this.selectedTrack;
    if (!track || track.source.toLowerCase() !== 'simulator') {
      event.preventDefault();
      return;
    }

    this.behaviorPlacementMode = mode;
    this.behaviorPlacementTrackId = track.id;
    this.behaviorPlacementPreviewLocation = undefined;
    this.behaviorPlacementPreviewScreen = undefined;
    this.trackPlacementActive = false;
    this.trackPlacementPreviewLocation = undefined;
    this.trackPlacementPreviewScreen = undefined;
    this.syncTrackPlacementPreviewEntity();
    this.geofencePlacementArmed = false;
    this.geofencePreviewLocation = undefined;
    this.syncGeofencePreviewEntity();
    if (mode === 'Move To Position') {
      this.refreshSelectedTrackWeather(true);
    }
    event.dataTransfer?.setData('text/plain', `behavior-${mode}`);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
    this.syncBehaviorPlacementPreviewEntity();
  }

  public endBehaviorPlacement(): void {
    this.behaviorPlacementMode = null;
    this.behaviorPlacementTrackId = '';
    this.behaviorPlacementPreviewLocation = undefined;
    this.behaviorPlacementPreviewScreen = undefined;
    this.syncBehaviorPlacementPreviewEntity();
  }

  public onFallbackMapClick(event: MouseEvent): void {
    if (this.globeMode !== 'fallback') {
      return;
    }

    const viewport = this.fallbackViewport?.nativeElement;
    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left - this.fallbackOffsetX) / (rect.width * this.fallbackScale);
    const relativeY = (event.clientY - rect.top - this.fallbackOffsetY) / (rect.height * this.fallbackScale);
    const bounds = this.getGeoBounds();
    const longitude = bounds.minLon + Math.min(1, Math.max(0, relativeX)) * bounds.lonSpan;
    const latitude = bounds.maxLat - Math.min(1, Math.max(0, relativeY)) * bounds.latSpan;

    if (this.behaviorPlacementMode && this.behaviorPlacementTrackId) {
      this.submitBehaviorOrder(this.behaviorPlacementTrackId, this.behaviorPlacementMode, latitude, longitude);
      return;
    }

    if (this.trackPlacementActive) {
      this.createSimulatorTrackAtLocation(latitude, longitude);
      return;
    }

    if (!this.geofencePlacementArmed) {
      return;
    }

    this.createGeofenceAtLocation(latitude, longitude);
  }

  public onGeofenceRadiusChanged(): void {
    this.geofenceRadiusMeters = Math.max(100, Math.min(25000, this.geofenceRadiusMeters));
    this.syncGeofencePreviewEntity();
  }

  public adjustGeofenceRadius(deltaMeters: number): void {
    this.geofenceRadiusMeters = Math.max(100, Math.min(25000, this.geofenceRadiusMeters + deltaMeters));
    this.syncGeofencePreviewEntity();
  }

  private handle3dGeofencePlacement(screenPosition: unknown): void {
    const location = this.resolveGlobeLocation(screenPosition);
    if (!location) {
      return;
    }

    this.geofencePreviewLocation = location;
    this.createGeofenceAtLocation(location.latitude, location.longitude);
  }

  private update3dGeofencePreview(screenPosition: unknown): void {
    const location = this.resolveGlobeLocation(screenPosition);
    if (!location) {
      return;
    }

    this.geofencePreviewLocation = location;
    this.syncGeofencePreviewEntity();
  }

  private update3dGeofencePreviewFromCenter(): void {
    if (!this.viewer || !this.cesium) {
      return;
    }

    const canvas = this.viewer.scene.canvas;
    this.update3dGeofencePreview(new this.cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
  }

  private updateTrackPlacementPreviewFromClient(clientX: number, clientY: number): void {
    const location = this.resolveLocationFromClientCoordinates(clientX, clientY);
    if (!location) {
      return;
    }

    this.trackPlacementPreviewLocation = location;
    this.trackPlacementPreviewScreen = this.resolveStageScreenPoint(clientX, clientY);
    this.syncTrackPlacementPreviewEntity();
  }

  private updateBehaviorPlacementPreviewFromClient(clientX: number, clientY: number): void {
    const location = this.resolveLocationFromClientCoordinates(clientX, clientY);
    if (!location) {
      return;
    }

    this.behaviorPlacementPreviewLocation = location;
    this.behaviorPlacementPreviewScreen = this.resolveStageScreenPoint(clientX, clientY);
    this.syncBehaviorPlacementPreviewEntity();
  }

  private resolveLocationFromClientCoordinates(clientX: number, clientY: number): GeofencePreviewLocation | undefined {
    if (this.globeMode === '3d' && this.viewer && this.cesium) {
      const rect = this.viewer.scene.canvas.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return undefined;
      }

      return this.resolveGlobeLocation(new this.cesium.Cartesian2(clientX - rect.left, clientY - rect.top));
    }

    const viewport = this.fallbackViewport?.nativeElement;
    if (!viewport) {
      return undefined;
    }

    const rect = viewport.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return undefined;
    }

    const relativeX = (clientX - rect.left - this.fallbackOffsetX) / (rect.width * this.fallbackScale);
    const relativeY = (clientY - rect.top - this.fallbackOffsetY) / (rect.height * this.fallbackScale);
    const bounds = this.getGeoBounds();
    return {
      longitude: bounds.minLon + Math.min(1, Math.max(0, relativeX)) * bounds.lonSpan,
      latitude: bounds.maxLat - Math.min(1, Math.max(0, relativeY)) * bounds.latSpan
    };
  }

  private resolveStageScreenPoint(clientX: number, clientY: number): ScreenPoint | undefined {
    const stage = document.querySelector('.globe-stage') as HTMLElement | null;
    if (!stage) {
      return undefined;
    }

    const rect = stage.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return undefined;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  private resolveGlobeLocation(screenPosition: unknown): GeofencePreviewLocation | undefined {
    if (!this.viewer || !this.cesium || !screenPosition) {
      return undefined;
    }

    const scene = this.viewer.scene;
    let cartesian = scene.pickPosition(screenPosition);
    if (!cartesian) {
      const ray = this.viewer.camera.getPickRay(screenPosition);
      if (ray) {
        cartesian = scene.globe.pick(ray, scene);
      }
    }

    if (!cartesian) {
      return undefined;
    }

    const cartographic = this.cesium.Cartographic.fromCartesian(cartesian);
    return {
      latitude: this.cesium.Math.toDegrees(cartographic.latitude),
      longitude: this.cesium.Math.toDegrees(cartographic.longitude)
    };
  }

  private syncGeofencePreviewEntity(): void {
    if (this.globeMode !== '3d' || !this.viewer || !this.cesium) {
      return;
    }

    const existingEntity = this.viewer.entities.getById(this.geofencePreviewEntityId);
    if (!this.geofencePlacementArmed || !this.geofencePreviewLocation) {
      if (existingEntity) {
        this.viewer.entities.remove(existingEntity);
      }
      this.viewer.scene.requestRender();
      return;
    }

    const position = this.cesium.Cartesian3.fromDegrees(this.geofencePreviewLocation.longitude, this.geofencePreviewLocation.latitude);
    if (existingEntity) {
      existingEntity.position = position;
      existingEntity.ellipse.semiMajorAxis = this.geofenceRadiusMeters;
      existingEntity.ellipse.semiMinorAxis = this.geofenceRadiusMeters;
      existingEntity.polyline.positions = this.createGroundEllipseBoundary(
        this.geofencePreviewLocation.latitude,
        this.geofencePreviewLocation.longitude,
        this.geofenceRadiusMeters,
        this.geofenceRadiusMeters
      );
      existingEntity.label.text = `PLACEMENT PREVIEW\n${Math.round(this.geofenceRadiusMeters)} m`;
    } else {
      this.viewer.entities.add({
        id: this.geofencePreviewEntityId,
        position,
        ellipse: {
          semiMajorAxis: this.geofenceRadiusMeters,
          semiMinorAxis: this.geofenceRadiusMeters,
          height: 0,
          heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
          material: this.cesium.Color.fromCssColorString('#ffd36b').withAlpha(0.18),
          outline: false
        },
        polyline: {
          positions: this.createGroundEllipseBoundary(
            this.geofencePreviewLocation.latitude,
            this.geofencePreviewLocation.longitude,
            this.geofenceRadiusMeters,
            this.geofenceRadiusMeters
          ),
          width: 3,
          clampToGround: true,
          material: this.cesium.Color.fromCssColorString('#ffd36b').withAlpha(0.95)
        },
        label: {
          text: `PLACEMENT PREVIEW\n${Math.round(this.geofenceRadiusMeters)} m`,
          font: 'bold 12px Bahnschrift',
          fillColor: this.cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: this.cesium.Color.fromCssColorString('#3a2604').withAlpha(0.82),
          pixelOffset: new this.cesium.Cartesian2(0, -22),
          verticalOrigin: this.cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
          heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }

    this.viewer.scene.requestRender();
  }

  private syncTrackPlacementPreviewEntity(): void {
    if (this.globeMode !== '3d' || !this.viewer || !this.cesium) {
      return;
    }

    const existingEntity = this.viewer.entities.getById(this.trackPlacementPreviewEntityId);
    if (!this.trackPlacementActive || !this.trackPlacementPreviewLocation) {
      if (existingEntity) {
        this.viewer.entities.remove(existingEntity);
      }
      this.viewer.scene.requestRender();
      return;
    }

    const previewTrack = this.simulatorTrackDraftPreview;
    const previewHeight = Math.max(previewTrack.altitudeMeters, 120) + 180;
    const position = this.cesium.Cartesian3.fromDegrees(
      this.trackPlacementPreviewLocation.longitude,
      this.trackPlacementPreviewLocation.latitude,
      previewHeight
    );
    const image = this.createMilStd2525TrackSymbol(previewTrack, true);

    if (existingEntity) {
      existingEntity.position = position;
      existingEntity.billboard.image = image;
      existingEntity.label.text = `DROP TO SPAWN\n${previewTrack.callsign}`;
    } else {
      this.viewer.entities.add({
        id: this.trackPlacementPreviewEntityId,
        position,
        billboard: {
          image,
          scale: 0.72,
          verticalOrigin: this.cesium.VerticalOrigin.CENTER,
          heightReference: this.cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: `DROP TO SPAWN\n${previewTrack.callsign}`,
          font: 'bold 12px Bahnschrift',
          fillColor: this.cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: this.cesium.Color.fromCssColorString('#062132').withAlpha(0.84),
          pixelOffset: new this.cesium.Cartesian2(0, -34),
          verticalOrigin: this.cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
          heightReference: this.cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }

    this.viewer.scene.requestRender();
  }

  private syncBehaviorPlacementPreviewEntity(): void {
    if (this.globeMode !== '3d' || !this.viewer || !this.cesium) {
      return;
    }

    const existingEntity = this.viewer.entities.getById(this.behaviorPlacementPreviewEntityId);
    if (!this.behaviorPlacementMode || !this.behaviorPlacementPreviewLocation) {
      if (existingEntity) {
        this.viewer.entities.remove(existingEntity);
      }
      this.viewer.scene.requestRender();
      return;
    }

    const position = this.cesium.Cartesian3.fromDegrees(
      this.behaviorPlacementPreviewLocation.longitude,
      this.behaviorPlacementPreviewLocation.latitude,
      80
    );
    const labelText = this.behaviorPlacementMode === 'Move To Position'
      ? 'CLICK TO MOVE'
      : 'CLICK TO SURVEIL LOCATION';

    if (existingEntity) {
      existingEntity.position = position;
      existingEntity.label.text = labelText;
    } else {
      this.viewer.entities.add({
        id: this.behaviorPlacementPreviewEntityId,
        position,
        point: {
          pixelSize: 14,
          color: this.cesium.Color.fromCssColorString('#ffd36b'),
          outlineColor: this.cesium.Color.fromCssColorString('#04111d'),
          outlineWidth: 2,
          heightReference: this.cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: labelText,
          font: 'bold 12px Bahnschrift',
          fillColor: this.cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: this.cesium.Color.fromCssColorString('#3a2604').withAlpha(0.84),
          pixelOffset: new this.cesium.Cartesian2(0, -18),
          verticalOrigin: this.cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
          heightReference: this.cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }

    this.viewer.scene.requestRender();
  }

  public startFallbackDrag(event: MouseEvent): void {
    if (this.globeMode !== 'fallback' || this.targetLock || this.geofencePlacementArmed) {
      return;
    }

    this.isDraggingFallback = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOriginX = this.fallbackOffsetX;
    this.dragOriginY = this.fallbackOffsetY;
  }

  public moveFallbackDrag(event: MouseEvent): void {
    if (!this.isDraggingFallback || this.targetLock) {
      return;
    }

    this.fallbackOffsetX = this.dragOriginX + (event.clientX - this.dragStartX);
    this.fallbackOffsetY = this.dragOriginY + (event.clientY - this.dragStartY);
  }

  public endFallbackDrag(): void {
    this.isDraggingFallback = false;
  }

  public zoomFallback(event: WheelEvent): void {
    if (this.globeMode !== 'fallback') {
      return;
    }

    event.preventDefault();
    const zoomDelta = event.deltaY > 0 ? -0.08 : 0.08;
    this.fallbackScale = Math.max(0.8, Math.min(2.8, this.fallbackScale + zoomDelta));
    if (this.targetLock) {
      this.centerOnSelectedTarget();
    }
  }

  public dismiss3dAndStayInFallback(): void {
    this.switchToFallback('3D globe dismissed by operator. Tactical map fallback active.');
  }

  private createDefaultSimulatorTrackDraft(): SimulatorTrackDraft {
    return {
      callsign: `VIPER-${Math.floor(Math.random() * 90) + 10}`,
      vehicleType: 'Quadcopter',
      classification: 'Unknown',
      affiliation: 'Unknown',
      alertLevel: 'Elevated',
      status: 'Tracking',
      altitudeMeters: 120,
      speedMetersPerSecond: 10,
      batteryMinutes: 28,
      headingDegrees: 0
    };
  }

  private canInitializeWebGl(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const contextOptions = {
        alpha: false,
        antialias: true,
        depth: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'high-performance' as WebGLPowerPreference,
        stencil: false
      };

      const webgl2 = canvas.getContext('webgl2', contextOptions);
      if (webgl2) {
        return true;
      }

      const webgl = canvas.getContext('webgl', contextOptions) || canvas.getContext('experimental-webgl', contextOptions);
      return !!webgl;
    } catch {
      return false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.ageRefreshTimerId) {
      window.clearInterval(this.ageRefreshTimerId);
      this.ageRefreshTimerId = undefined;
    }
    this.entityClickHandler?.destroy();
    this.viewer?.destroy();
    this.buildingsTileset = undefined;
  }

  @HostListener('window:resize')
  public handleResize(): void {
    const canvasHost = document.getElementById('globe');
    if (this.viewer && canvasHost && canvasHost.clientWidth > 0 && canvasHost.clientHeight > 0) {
      this.viewer.resize();
      this.viewer.scene.requestRender();
    }
  }

  public get selectedTrack(): Track | undefined {
    return this.snapshot?.tracks.find(track => track.id === this.selectedTrackId);
  }

  public get selectedSite(): ProtectedSite | undefined {
    return this.snapshot?.protectedSites.find(site => site.id === this.selectedSiteId);
  }

  public get canCreateSimulatorTracks(): boolean {
    return (this.snapshot?.transportStatus.connectedClients ?? 0) > 0;
  }

  public get simulatorTrackDraftPreview(): Track {
    return {
      id: 'trk-preview',
      callsign: this.simulatorTrackDraft.callsign.trim() || 'NEW-01',
      source: 'simulator',
      vehicleType: this.simulatorTrackDraft.vehicleType,
      classification: this.simulatorTrackDraft.classification,
      affiliation: this.simulatorTrackDraft.affiliation,
      status: this.simulatorTrackDraft.status,
      alertLevel: this.simulatorTrackDraft.alertLevel,
      latitude: this.trackPlacementPreviewLocation?.latitude ?? 39.7392,
      longitude: this.trackPlacementPreviewLocation?.longitude ?? -104.9903,
      altitudeMeters: this.simulatorTrackDraft.altitudeMeters,
      speedMetersPerSecond: this.simulatorTrackDraft.speedMetersPerSecond,
      groundSpeedMetersPerSecond: 0,
      verticalSpeedMetersPerSecond: 0,
      batteryMinutes: this.simulatorTrackDraft.batteryMinutes,
      headingDegrees: this.simulatorTrackDraft.headingDegrees,
      confidence: 0.88,
      behavior: 'Random',
      lastUpdateUtc: new Date().toISOString()
    };
  }

  public get canOrderSelectedTrackBehavior(): boolean {
    return !!this.selectedTrack && this.selectedTrack.source.toLowerCase() === 'simulator';
  }

  public get behaviorTargetOptions(): Track[] {
    if (!this.snapshot || !this.selectedTrackId) {
      return [];
    }

    return this.snapshot.tracks.filter(track => track.id !== this.selectedTrackId);
  }

  public get selectedCommand(): CommandDefinition | undefined {
    return this.snapshot?.availableCommands.find(command => command.id === this.selectedCommandId);
  }

  public get highPriorityCount(): number {
    return this.snapshot?.tracks.filter(track => track.alertLevel.toLowerCase() === 'high').length ?? 0;
  }

  public get elevatedCount(): number {
    return this.snapshot?.tracks.filter(track => track.alertLevel.toLowerCase() === 'elevated').length ?? 0;
  }

  public get selectedTrackActivity(): OperatorActionLogEntry[] {
    if (!this.snapshot || !this.selectedTrackId) {
      return [];
    }

    return this.snapshot.actionLog.filter(entry => entry.trackId === this.selectedTrackId);
  }

  public get selectedSiteActivity(): OperatorActionLogEntry[] {
    if (!this.snapshot || !this.selectedSiteId) {
      return [];
    }

    return this.snapshot.actionLog.filter(entry => entry.trackId === this.selectedSiteId);
  }

  public get selectedTrackCommands(): CommandDefinition[] {
    if (!this.snapshot) {
      return [];
    }

    const track = this.selectedTrack;
    if (!track) {
      return this.snapshot.availableCommands;
    }

    if (track.affiliation.toLowerCase() === 'friendly') {
      return this.snapshot.availableCommands.filter(command => command.id !== 'dispatch');
    }

    return this.snapshot.availableCommands;
  }

  public get fallbackTracks(): Array<Track & { x: number; y: number }> {
    if (!this.snapshot?.tracks?.length) {
      return [];
    }

    const longitudes = this.snapshot.tracks.map(track => track.longitude);
    const latitudes = this.snapshot.tracks.map(track => track.latitude);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const lonSpan = Math.max(maxLon - minLon, 0.02);
    const latSpan = Math.max(maxLat - minLat, 0.02);

    return this.snapshot.tracks.map(track => ({
      ...track,
      x: ((track.longitude - minLon) / lonSpan) * 100,
      y: 100 - ((track.latitude - minLat) / latSpan) * 100
    }));
  }

  public get fallbackSites(): Array<{ id: string; name: string; x: number; y: number; radius: number }> {
    if (!this.snapshot?.protectedSites?.length) {
      return [];
    }

    const allLongitudes = [
      ...this.snapshot.protectedSites.map(site => site.longitude),
      ...(this.snapshot.tracks?.map(track => track.longitude) ?? [])
    ];
    const allLatitudes = [
      ...this.snapshot.protectedSites.map(site => site.latitude),
      ...(this.snapshot.tracks?.map(track => track.latitude) ?? [])
    ];

    const minLon = Math.min(...allLongitudes);
    const maxLon = Math.max(...allLongitudes);
    const minLat = Math.min(...allLatitudes);
    const maxLat = Math.max(...allLatitudes);
    const lonSpan = Math.max(maxLon - minLon, 0.02);
    const latSpan = Math.max(maxLat - minLat, 0.02);

    return this.snapshot.protectedSites.map(site => ({
      id: site.id,
      name: site.name,
      x: ((site.longitude - minLon) / lonSpan) * 100,
      y: 100 - ((site.latitude - minLat) / latSpan) * 100,
      radius: Math.max(4, Math.min(18, site.radiusMeters / 220))
    }));
  }

  public get fallbackTrailPaths(): Array<{ trackId: string; points: string; tone: string }> {
    const bounds = this.getGeoBounds();

    return Array.from(this.trackHistory.entries())
      .filter(([, history]) => history.length > 1)
      .map(([trackId, history]) => {
        const track = this.snapshot?.tracks.find(item => item.id === trackId);
        const points = history
          .map(point => {
            const x = ((point.longitude - bounds.minLon) / bounds.lonSpan) * 100;
            const y = 100 - ((point.latitude - bounds.minLat) / bounds.latSpan) * 100;
            return `${x},${y}`;
          })
          .join(' ');

        return { trackId, points, tone: this.statusTone(track) };
      });
  }

  public trackCardClass(track: Track): string {
    return `contact-row contact-row--${track.alertLevel.toLowerCase()}`;
  }

  public selectWorkspaceTab(tab: WorkspaceTab): void {
    this.workspaceTab = tab;
  }

  public selectRightPaneTab(tab: RightPaneTab): void {
    this.rightPaneTab = tab;
  }

  public useQuickAction(commandId: string): void {
    this.selectedCommandId = commandId;
    this.rightPaneTab = 'actions';
    this.actionNotes = this.quickActionPresets.find(preset => preset.commandId === commandId)?.detail ?? this.actionNotes;
  }

  public submitAction(): void {
    if (!this.selectedTrackId || !this.selectedCommandId) {
      return;
    }

    const request: OperatorActionRequest = {
      trackId: this.selectedTrackId,
      commandId: this.selectedCommandId,
      notes: this.actionNotes.trim(),
      operator: this.operatorName.trim() || 'Control Alpha'
    };

    this.airPictureService.recordAction(request).subscribe({
      next: () => {
        this.actionNotes = '';
        this.rightPaneTab = 'activity';
      },
      error: (error) => {
        console.error(error);
      }
    });
  }

  public submitReclassification(): void {
    const track = this.selectedTrack;
    if (!track?.id) {
      return;
    }

    const request: TrackUpdateRequest = {
      vehicleType: this.reclassifyVehicleType.trim(),
      classification: this.reclassifyClassification.trim(),
      affiliation: this.reclassifyAffiliation.trim(),
      alertLevel: this.reclassifyAlertLevel.trim(),
      status: this.reclassifyStatus.trim(),
      operator: this.operatorName.trim() || 'Control Alpha',
      notes: this.actionNotes.trim()
    };

    this.airPictureService.updateTrack(track.id, request).subscribe({
      next: () => {
        this.actionNotes = '';
        this.rightPaneTab = 'details';
      },
      error: (error) => {
        console.error(error);
        if (error?.status === 404) {
          this.selectedTrackId = '';
          this.hydratedTrackFormId = '';
          this.airPictureService.getSnapshot().subscribe({
            next: (snapshot) => this.applySnapshot(snapshot),
            error: (refreshError) => console.error(refreshError)
          });
        }
      }
    });
  }

  public deleteSelectedTrack(): void {
    const track = this.selectedTrack;
    if (!track || !track.id) {
      return;
    }

    this.airPictureService.deleteTrack(track.id).subscribe({
      next: () => {
        this.selectedTrackId = '';
        this.hydratedTrackFormId = '';
        this.actionNotes = '';
        this.rightPaneTab = 'activity';
      },
      error: (error) => console.error(error)
    });
  }

  public orderSelectedTrackBehavior(behavior: string): void {
    const track = this.selectedTrack;
    if (!track) {
      return;
    }

    this.submitBehaviorOrder(track.id, behavior);
  }

  public createGeofence(): void {
    const track = this.selectedTrack;
    if (!track) {
      return;
    }

    const request: CreateGeofenceRequest = {
      name: this.geofenceName.trim() || `${track.callsign} geofence`,
      latitude: track.latitude,
      longitude: track.longitude,
      radiusMeters: this.geofenceRadiusMeters,
      posture: 'Geofence'
    };

    this.airPictureService.createGeofence(request).subscribe({
      next: (site) => {
        this.geofenceName = `${track.callsign} geofence`;
        this.focusSite(site.id);
        this.rightPaneTab = 'activity';
      },
      error: (error) => console.error(error)
    });
  }

  public focusTrack(trackId: string): void {
    this.selectedTrackId = trackId;
    this.selectedSiteId = '';
    this.hydratedSiteFormId = '';
    this.workspaceTab = 'contacts';
    this.rightPaneTab = 'actions';
    const track = this.snapshot?.tracks.find(item => item.id === trackId);
    if (track) {
      this.hydrateTrackForm(track);
      this.behaviorCruiseAltitudeMeters = Math.round(track.commandCruiseAltitudeMeters ?? track.altitudeMeters);
      if (!this.behaviorTargetTrackId || this.behaviorTargetTrackId === track.id) {
        this.behaviorTargetTrackId = this.snapshot?.tracks.find(item => item.id !== track.id)?.id ?? '';
      }
    }
    if (track && this.viewer && this.cesium && this.targetLock) {
      this.flyCameraToTrack(track);
    }
    if (this.targetLock) {
      this.refocusCameraOnCurrentTarget();
      this.centerOnSelectedTarget();
    }
    this.refreshSelectedTrackWeather(true);
    this.renderScene();
  }

  public focusSite(siteId: string): void {
    this.selectedSiteId = siteId;
    this.selectedTrackId = '';
    this.weatherSnapshot = undefined;
    this.hydratedTrackFormId = '';
    this.workspaceTab = 'sites';
    this.rightPaneTab = 'details';
    const site = this.snapshot?.protectedSites.find(item => item.id === siteId);
    if (site) {
      this.hydrateSiteForm(site);
    }
    this.renderScene();
  }

  public formatTimestamp(value?: string): string {
    if (!value) {
      return 'No traffic yet';
    }

    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  public formatAge(value?: string): string {
    if (!value) {
      return 'No update';
    }

    const elapsedSeconds = Math.max(0, Math.round((this.currentTimeMs - new Date(value).getTime()) / 1000));
    if (elapsedSeconds < 60) {
      return `${elapsedSeconds}s ago`;
    }

    return `${Math.round(elapsedSeconds / 60)}m ago`;
  }

  public contactRibbon(track: Track): string {
    return `${track.classification} | ${track.vehicleType} | ${track.affiliation}`;
  }

  public statusTone(track: Track | undefined): string {
    if (!track) {
      return 'neutral';
    }

    return track.alertLevel.toLowerCase();
  }

  private buildTransportSummary(snapshot: AirPictureSnapshot): string {
    const status = snapshot.transportStatus;
    const health = status.listenerOnline ? 'TCP online' : 'TCP offline';
    const stream = this.signalrOnline ? 'streaming live' : 'stream pending';
    const lastMessage = status.lastMessageUtc ? `last contact ${this.formatTimestamp(status.lastMessageUtc)}` : 'no simulator traffic yet';
    return `${health} :${status.tcpPort} | ${status.connectedClients} client(s) | ${stream} | ${lastMessage}`;
  }

  private applySnapshot(snapshot: AirPictureSnapshot): void {
    this.snapshot = snapshot;
    this.loading = false;
    this.transportSummary = this.buildTransportSummary(snapshot);
    this.updateTrackHistory(snapshot);

    if (!this.selectedTrackId && !this.selectedSiteId && snapshot.tracks.length > 0) {
      this.selectedTrackId = snapshot.tracks[0].id;
      this.selectedSiteId = '';
      this.hydratedSiteFormId = '';
      const initialTrack = snapshot.tracks[0];
      this.hydrateTrackForm(initialTrack);
    }

    if (this.selectedTrackId && !snapshot.tracks.some(track => track.id === this.selectedTrackId)) {
      this.selectedTrackId = '';
      this.weatherSnapshot = undefined;
      this.hydratedTrackFormId = '';
    }

    if (this.selectedSiteId) {
      const currentSite = snapshot.protectedSites.find(site => site.id === this.selectedSiteId);
      if (currentSite) {
      } else {
        this.selectedSiteId = '';
        this.hydratedSiteFormId = '';
      }
    }

    const availableCommands = this.selectedTrackCommands;
    if (!availableCommands.some(command => command.id === this.selectedCommandId)) {
      this.selectedCommandId = availableCommands[0]?.id ?? '';
    }

    if (this.targetLock) {
      this.centerOnSelectedTarget();
    }
    this.refreshSelectedTrackWeather();
    this.renderScene();
  }

  private centerOnSelectedTarget(): void {
    if (this.globeMode !== 'fallback' || !this.selectedTrackId) {
      return;
    }

    const viewport = this.fallbackViewport?.nativeElement;
    if (!viewport) {
      return;
    }

    const selected = this.fallbackTracks.find(track => track.id === this.selectedTrackId);
    if (!selected) {
      return;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const targetX = (selected.x / 100) * viewportWidth * this.fallbackScale;
    const targetY = (selected.y / 100) * viewportHeight * this.fallbackScale;

    this.fallbackOffsetX = viewportWidth / 2 - targetX;
    this.fallbackOffsetY = viewportHeight / 2 - targetY;
  }

  private updateTrackHistory(snapshot: AirPictureSnapshot): void {
    for (const track of snapshot.tracks) {
      const history = this.trackHistory.get(track.id) ?? [];
      history.push({ latitude: track.latitude, longitude: track.longitude });
      if (history.length > 12) {
        history.shift();
      }
      this.trackHistory.set(track.id, history);
    }
  }

  private getGeoBounds(): GeoBounds {
    const longitudes = [
      ...(this.snapshot?.tracks.map(track => track.longitude) ?? []),
      ...(this.snapshot?.protectedSites.map(site => site.longitude) ?? []),
      -104.9903
    ];
    const latitudes = [
      ...(this.snapshot?.tracks.map(track => track.latitude) ?? []),
      ...(this.snapshot?.protectedSites.map(site => site.latitude) ?? []),
      39.7392
    ];

    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);

    return {
      minLon,
      maxLon,
      minLat,
      maxLat,
      lonSpan: Math.max(maxLon - minLon, 0.02),
      latSpan: Math.max(maxLat - minLat, 0.02)
    };
  }

  private normalizeClassification(classification: string, affiliation: string): string {
    if (this.classificationOptions.includes(classification)) {
      return classification;
    }

    const normalized = `${classification} ${affiliation}`.toLowerCase();
    if (normalized.includes('hostile')) {
      return 'Hostile';
    }
    if (normalized.includes('suspect') || normalized.includes('uncooperative')) {
      return 'Suspect';
    }
    if (normalized.includes('neutral')) {
      return 'Neutral';
    }
    if (normalized.includes('friend')) {
      return 'Friendly';
    }
    if (normalized.includes('pending')) {
      return 'Pending';
    }
    return 'Unknown';
  }

  private normalizeAffiliation(affiliation: string): string {
    const match = this.affiliationOptions.find(option => option.toLowerCase() === affiliation.toLowerCase());
    return match ?? 'Unknown';
  }

  private normalizeAlertLevel(alertLevel: string): string {
    const match = this.alertLevelOptions.find(option => option.toLowerCase() === alertLevel.toLowerCase());
    return match ?? 'Elevated';
  }

  private normalizeStatus(status: string): string {
    const match = this.statusOptions.find(option => option.toLowerCase() === status.toLowerCase());
    return match ?? 'Tracking';
  }

  private normalizeVehicleType(vehicleType: string): string {
    const normalized = vehicleType.toLowerCase();
    if (normalized.includes('quad') || normalized.includes('drone') || normalized.includes('uas') || normalized.includes('uav')) {
      return 'Quadcopter';
    }
    if (normalized.includes('fixed')) {
      return 'Fixed Wing';
    }
    if (normalized.includes('heli') || normalized.includes('rotary')) {
      return 'Helicopter';
    }
    if (normalized.includes('ground') || normalized.includes('vehicle') || normalized.includes('truck')) {
      return 'Ground Vehicle';
    }
    return 'Unknown';
  }

  private normalizeSitePosture(posture: string): string {
    const match = this.sitePostureOptions.find(option => option.toLowerCase() === posture.toLowerCase());
    return match ?? 'Geofence';
  }

  private refreshSelectedTrackWeather(force = false): void {
    if (!this.selectedTrack) {
      this.weatherSnapshot = undefined;
      return;
    }

    const track = this.selectedTrack;
    const now = Date.now();
    const lastFetchedAtMs = this.lastWeatherFetchAtMsByTrackId.get(track.id) ?? 0;
    if (!force && now - lastFetchedAtMs < 30000) {
      return;
    }

    this.lastWeatherFetchAtMsByTrackId.set(track.id, now);
    this.airPictureService.getWeather(track.latitude, track.longitude, track.altitudeMeters).subscribe({
      next: (weather) => {
        this.weatherSnapshot = weather;
        this.weatherSnapshotsByTrackId.set(track.id, weather);
        this.renderScene();
      },
      error: (error) => console.error(error)
    });
  }

  private getWeatherSnapshotForTrack(track: Track): WeatherSnapshot | undefined {
    if (this.selectedTrackId === track.id && this.weatherSnapshot) {
      return this.weatherSnapshot;
    }

    return this.weatherSnapshotsByTrackId.get(track.id);
  }

  public formatWindDirection(degrees?: number): string {
    if (degrees == null || Number.isNaN(degrees)) {
      return 'Calm';
    }

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const normalized = ((degrees % 360) + 360) % 360;
    return directions[Math.round(normalized / 45) % directions.length];
  }

  public submitSiteUpdate(): void {
    if (!this.selectedSiteId) {
      return;
    }

    const request: UpdateGeofenceRequest = {
      name: this.editSiteName.trim(),
      radiusMeters: Math.max(100, Math.min(25000, this.editSiteRadiusMeters)),
      posture: this.editSitePosture.trim()
    };

    this.airPictureService.updateGeofence(this.selectedSiteId, request).subscribe({
      next: (site) => {
        this.hydrateSiteForm(site);
        this.rightPaneTab = 'activity';
      },
      error: (error) => console.error(error)
    });
  }

  private hydrateTrackForm(track: Track): void {
    this.reclassifyVehicleType = this.normalizeVehicleType(track.vehicleType);
    this.reclassifyClassification = this.normalizeClassification(track.classification, track.affiliation);
    this.reclassifyAffiliation = this.normalizeAffiliation(track.affiliation);
    this.reclassifyAlertLevel = this.normalizeAlertLevel(track.alertLevel);
    this.reclassifyStatus = this.normalizeStatus(track.status);
    this.geofenceName = `${track.callsign} geofence`;
    this.hydratedTrackFormId = track.id;
  }

  private hydrateSiteForm(site: ProtectedSite): void {
    this.editSiteName = site.name;
    this.editSiteRadiusMeters = Math.round(site.radiusMeters);
    this.editSitePosture = this.normalizeSitePosture(site.posture);
    this.geofenceName = site.name;
    this.geofenceRadiusMeters = Math.round(site.radiusMeters);
    this.hydratedSiteFormId = site.id;
  }

  private createGeofenceAtLocation(latitude: number, longitude: number): void {
    const request: CreateGeofenceRequest = {
      name: this.geofenceName.trim() || 'Ad hoc geofence',
      latitude,
      longitude,
      radiusMeters: this.geofenceRadiusMeters,
      posture: 'Geofence'
    };

    this.airPictureService.createGeofence(request).subscribe({
      next: (site) => {
        this.geofencePlacementArmed = false;
        this.geofencePreviewLocation = undefined;
        this.focusSite(site.id);
        if (this.globeMode === '3d') {
          this.syncGeofencePreviewEntity();
        }
        this.rightPaneTab = 'activity';
      },
      error: (error) => console.error(error)
    });
  }

  private createSimulatorTrackAtLocation(latitude: number, longitude: number): void {
    const request: CreateSimulatorTrackRequest = {
      callsign: this.simulatorTrackDraft.callsign.trim(),
      vehicleType: this.simulatorTrackDraft.vehicleType,
      classification: this.simulatorTrackDraft.classification,
      affiliation: this.simulatorTrackDraft.affiliation,
      alertLevel: this.simulatorTrackDraft.alertLevel,
      status: this.simulatorTrackDraft.status,
      latitude,
      longitude,
      altitudeMeters: Math.max(40, Math.min(4000, this.simulatorTrackDraft.altitudeMeters)),
      speedMetersPerSecond: Math.max(1, Math.min(80, this.simulatorTrackDraft.speedMetersPerSecond)),
      batteryMinutes: Math.max(5, Math.min(300, this.simulatorTrackDraft.batteryMinutes)),
      headingDegrees: ((this.simulatorTrackDraft.headingDegrees % 360) + 360) % 360
    };

    this.creatingSimulatorTrack = true;
    this.airPictureService.createSimulatorTrack(request).subscribe({
      next: (track) => {
        this.creatingSimulatorTrack = false;
        if (this.snapshot) {
          this.snapshot = {
            ...this.snapshot,
            tracks: [...this.snapshot.tracks.filter(existingTrack => existingTrack.id !== track.id), track]
          };
        }
        this.lastWeatherFetchAtMsByTrackId.delete(track.id);
        this.airPictureService.getWeather(track.latitude, track.longitude, track.altitudeMeters).subscribe({
          next: (weather) => {
            this.weatherSnapshotsByTrackId.set(track.id, weather);
            if (this.selectedTrackId === track.id) {
              this.weatherSnapshot = weather;
            }
            this.renderScene();
          },
          error: (error) => console.error(error)
        });
        this.focusTrack(track.id);
        this.endSimulatorTrackDrag();
        this.simulatorTrackDraft = this.createDefaultSimulatorTrackDraft();
      },
      error: (error) => {
        this.creatingSimulatorTrack = false;
        console.error(error);
        this.endSimulatorTrackDrag();
      }
    });
  }

  private submitBehaviorOrder(
    trackId: string,
    behavior: string,
    latitude?: number,
    longitude?: number
  ): void {
    const selectedTrack = this.snapshot?.tracks.find(track => track.id === trackId);
    if (behavior === 'Move To Position' && selectedTrack && latitude != null && longitude != null) {
      const projectedRangeMeters = this.calculatePotentialRangeMeters(selectedTrack, { latitude, longitude });
      const destinationDistanceMeters = this.calculateDistanceMeters(
        selectedTrack.latitude,
        selectedTrack.longitude,
        latitude,
        longitude
      );

      if (destinationDistanceMeters > projectedRangeMeters) {
        this.pendingBehaviorOrder = {
          trackId,
          behavior,
          latitude,
          longitude,
          projectedRangeMeters,
          destinationDistanceMeters
        };
        return;
      }
    }

    this.dispatchBehaviorOrder(trackId, behavior, latitude, longitude);
  }

  public cancelPendingBehaviorOrder(): void {
    this.pendingBehaviorOrder = undefined;
  }

  public confirmPendingBehaviorOrder(): void {
    const pendingOrder = this.pendingBehaviorOrder;
    if (!pendingOrder) {
      return;
    }

    this.pendingBehaviorOrder = undefined;
    this.dispatchBehaviorOrder(
      pendingOrder.trackId,
      pendingOrder.behavior,
      pendingOrder.latitude,
      pendingOrder.longitude
    );
  }

  private dispatchBehaviorOrder(
    trackId: string,
    behavior: string,
    latitude?: number,
    longitude?: number
  ): void {

    const request: TrackBehaviorOrderRequest = {
      behavior,
      latitude,
      longitude,
      targetTrackId: (behavior === 'Surveil Track' || behavior === 'Engage Track') ? this.behaviorTargetTrackId : undefined,
      standoffRadiusMeters: (behavior === 'Surveil Location' || behavior === 'Surveil Track')
        ? Math.max(30, Math.min(2000, this.behaviorRadiusMeters))
        : undefined,
      cruiseAltitudeMeters: behavior === 'Move To Position' && this.behaviorCruiseAltitudeMeters != null
        ? Math.max(30, Math.min(4000, this.behaviorCruiseAltitudeMeters))
        : undefined,
      operator: this.operatorName.trim() || 'Control Alpha',
      notes: this.actionNotes.trim(),
      optimizeAltitude: behavior === 'Move To Position' && this.behaviorCruiseAltitudeMeters == null
    };

    this.airPictureService.orderTrackBehavior(trackId, request).subscribe({
      next: (updatedTrack) => {
        if (this.snapshot) {
          this.snapshot = {
            ...this.snapshot,
            tracks: this.snapshot.tracks.map(track => track.id === updatedTrack.id ? updatedTrack : track)
          };
        }
        this.actionNotes = '';
        this.rightPaneTab = 'activity';
        if (this.selectedTrackId === updatedTrack.id) {
          this.refreshSelectedTrackWeather(true);
        }
        this.renderScene();
        this.endBehaviorPlacement();
      },
      error: (error) => {
        console.error(error);
        this.endBehaviorPlacement();
      }
    });
  }

  private createMilStd2525TrackSymbol(track: Track, selected: boolean): HTMLCanvasElement {
    const sidc = this.getMilStd2525Sidc(track);
    const directionBucket = this.getTrackDirectionBucket(track.headingDegrees);
    const cacheKey = `${sidc}|${selected ? 'selected' : 'default'}|${directionBucket}`;
    const cachedSymbol = this.milStdSymbolCache.get(cacheKey);
    if (cachedSymbol) {
      return cachedSymbol;
    }

    const symbol = new ms.Symbol(sidc, {
      standard: '2525',
      size: selected ? 40 : 34,
      frame: true,
      fill: true,
      icon: true,
      infoFields: true,
      outlineWidth: selected ? 8 : 4,
      direction: directionBucket
    }).asCanvas();

    this.milStdSymbolCache.set(cacheKey, symbol);
    return symbol;
  }

  private getTrackDirectionBucket(headingDegrees: number): number {
    const normalizedHeading = ((headingDegrees % 360) + 360) % 360;
    const bucketSizeDegrees = 15;
    return Math.round(normalizedHeading / bucketSizeDegrees) * bucketSizeDegrees % 360;
  }

  private getTrackVisualStateKey(track: Track, selected: boolean): string {
    return [
      selected ? 'selected' : 'default',
      this.getMilStd2525Sidc(track),
      this.getTrackDirectionBucket(track.headingDegrees)
    ].join('|');
  }

  private getTrackLabelStateKey(track: Track, selected: boolean): string {
    return [
      track.callsign,
      track.alertLevel,
      selected ? 'selected' : 'default'
    ].join('|');
  }

  private getMilStd2525Sidc(track: Track): string {
    const affiliation = this.getMilStd2525AffiliationCode(track.classification, track.affiliation);
    const descriptor = `${track.vehicleType} ${track.classification} ${track.source}`.toLowerCase();

    if (descriptor.includes('ground') || descriptor.includes('vehicle') || descriptor.includes('truck')) {
      return `S${affiliation}GPUCI----K---`;
    }

    return `S${affiliation}APMFQ----K---`;
  }

  private getMilStd2525AffiliationCode(classification: string, affiliation: string): string {
    const normalizedIdentity = `${classification} ${affiliation}`.toLowerCase();

    if (normalizedIdentity.includes('hostile')) {
      return 'H';
    }

    if (normalizedIdentity.includes('neutral')) {
      return 'N';
    }

    if (normalizedIdentity.includes('unknown') || normalizedIdentity.includes('suspect') || normalizedIdentity.includes('pending')) {
      return 'U';
    }

    return 'F';
  }

  private getDroneSpec(track: Track): { topSpeedMs: number; batteryMinutes: number; climbRateMs: number; descentRateMs: number; reserveFactor: number } {
    const configuredTopSpeed = track.speedMetersPerSecond ?? 0;
    const configuredBatteryMinutes = track.batteryMinutes ?? 0;
    const reserveFactor = 0.8;
    if (configuredTopSpeed > 0 && configuredBatteryMinutes > 0) {
      switch (track.vehicleType) {
        case 'Fixed Wing':
          return { topSpeedMs: configuredTopSpeed, batteryMinutes: Math.max(5, configuredBatteryMinutes), climbRateMs: 7, descentRateMs: 9, reserveFactor };
        case 'Helicopter':
          return { topSpeedMs: configuredTopSpeed, batteryMinutes: Math.max(5, configuredBatteryMinutes), climbRateMs: 5, descentRateMs: 6, reserveFactor };
        case 'Ground Vehicle':
          return { topSpeedMs: configuredTopSpeed, batteryMinutes: Math.max(5, configuredBatteryMinutes), climbRateMs: 0, descentRateMs: 0, reserveFactor };
        default:
          return { topSpeedMs: configuredTopSpeed, batteryMinutes: Math.max(5, configuredBatteryMinutes), climbRateMs: 4, descentRateMs: 6, reserveFactor };
      }
    }

    switch (track.vehicleType) {
      case 'Fixed Wing':
        return { topSpeedMs: 28, batteryMinutes: 55, climbRateMs: 7, descentRateMs: 9, reserveFactor };
      case 'Helicopter':
        return { topSpeedMs: 18, batteryMinutes: 40, climbRateMs: 5, descentRateMs: 6, reserveFactor };
      case 'Ground Vehicle':
        return { topSpeedMs: 10, batteryMinutes: 180, climbRateMs: 0, descentRateMs: 0, reserveFactor };
      default:
        return { topSpeedMs: 14, batteryMinutes: 28, climbRateMs: 4, descentRateMs: 6, reserveFactor };
    }
  }

  public getTrackGroundSpeed(track: Track): number {
    return Math.max(0, track.groundSpeedMetersPerSecond ?? 0);
  }

  public getTrackVerticalSpeed(track: Track): number {
    return track.verticalSpeedMetersPerSecond ?? 0;
  }

  private calculatePotentialRangeMeters(track: Track, destination?: { latitude: number; longitude: number }): number {
    const spec = this.getDroneSpec(track);
    if (!destination) {
      return spec.topSpeedMs * spec.batteryMinutes * 60 * spec.reserveFactor;
    }

    const courseDegrees = this.calculateBearingDegrees(track.latitude, track.longitude, destination.latitude, destination.longitude);
    return this.calculateBestRangeMetersForBearing(track, courseDegrees);
  }

  private calculateWindCorrectedGroundSpeedMs(
    airspeedMs: number,
    windSpeedMs: number,
    windToBearingDegrees: number,
    trackBearingDegrees: number
  ): number {
    const relativeRadians = (windToBearingDegrees - trackBearingDegrees) * Math.PI / 180;
    const alongTrackWindMs = Math.cos(relativeRadians) * windSpeedMs;
    const crosswindMs = Math.sin(relativeRadians) * windSpeedMs;

    if (Math.abs(crosswindMs) >= airspeedMs) {
      return Math.max(0, alongTrackWindMs);
    }

    const correctedAirspeedAlongTrackMs = Math.sqrt((airspeedMs * airspeedMs) - (crosswindMs * crosswindMs));
    return Math.max(0, alongTrackWindMs + correctedAirspeedAlongTrackMs);
  }

  private getOperationalWeatherLayers(track: Track): WeatherLayerSnapshot[] {
    const weather = this.getWeatherSnapshotForTrack(track);
    if (weather?.layers?.length) {
      return [...weather.layers].sort((left, right) => left.altitudeMeters - right.altitudeMeters);
    }

    if (weather) {
      return [
        {
          id: 'surface',
          altitudeMeters: 30,
          windSpeedMs: weather.currentWindSpeedMs,
          windDirectionDegrees: weather.currentWindDirectionDegrees,
          cloudCoverPercent: weather.currentCloudCoverPercent
        },
        {
          id: 'selected',
          altitudeMeters: weather.altitudeLayerMeters,
          windSpeedMs: weather.altitudeWindSpeedMs,
          windDirectionDegrees: weather.altitudeWindDirectionDegrees,
          cloudCoverPercent: weather.altitudeCloudCoverPercent
        }
      ].sort((left, right) => left.altitudeMeters - right.altitudeMeters);
    }

    return [];
  }

  private estimateReachMetersForLayer(track: Track, layer: WeatherLayerSnapshot, trackBearingDegrees: number): number {
    const spec = this.getDroneSpec(track);
    const enduranceSeconds = spec.batteryMinutes * 60 * spec.reserveFactor;
    if (enduranceSeconds <= 0 || spec.topSpeedMs <= 0) {
      return 0;
    }

    const currentAltitudeMeters = Math.max(track.altitudeMeters ?? 0, 0);
    const altitudeDeltaMeters = layer.altitudeMeters - currentAltitudeMeters;
    let transitionTimeSeconds = 0;
    let transitionDistanceMeters = 0;

    if (Math.abs(altitudeDeltaMeters) > 1) {
      const climbing = altitudeDeltaMeters > 0;
      const verticalRateMs = climbing ? spec.climbRateMs : spec.descentRateMs;
      if (verticalRateMs <= 0) {
        return 0;
      }

      transitionTimeSeconds = Math.abs(altitudeDeltaMeters) / verticalRateMs;
      const transitionHorizontalAirspeedMs = climbing
        ? Math.sqrt(Math.max(0, (spec.topSpeedMs * spec.topSpeedMs) - (verticalRateMs * verticalRateMs)))
        : spec.topSpeedMs;
      const transitionGroundSpeedMs = this.calculateWindCorrectedGroundSpeedMs(
        transitionHorizontalAirspeedMs,
        layer.windSpeedMs,
        (layer.windDirectionDegrees + 180) % 360,
        trackBearingDegrees
      );
      transitionDistanceMeters = transitionGroundSpeedMs * Math.min(enduranceSeconds, transitionTimeSeconds);
    }

    const remainingEnduranceSeconds = Math.max(0, enduranceSeconds - transitionTimeSeconds);
    const cruiseGroundSpeedMs = this.calculateWindCorrectedGroundSpeedMs(
      spec.topSpeedMs,
      layer.windSpeedMs,
      (layer.windDirectionDegrees + 180) % 360,
      trackBearingDegrees
    );

    return transitionDistanceMeters + (cruiseGroundSpeedMs * remainingEnduranceSeconds);
  }

  private calculateBestRangeMetersForBearing(track: Track, trackBearingDegrees: number): number {
    const layers = this.getOperationalWeatherLayers(track);
    if (!layers.length) {
      const spec = this.getDroneSpec(track);
      return spec.topSpeedMs * spec.batteryMinutes * 60 * spec.reserveFactor;
    }

    return layers.reduce((bestRangeMeters, layer) => {
      return Math.max(bestRangeMeters, this.estimateReachMetersForLayer(track, layer, trackBearingDegrees));
    }, 0);
  }

  private getWeatherDrivenRangeShape(track: Track): {
    centerLatitude: number;
    centerLongitude: number;
    semiMajorAxis: number;
    semiMinorAxis: number;
    rotationRadians: number;
    windDriftMeters: number;
    layerMeters: number;
    downwindRangeMeters: number;
    upwindRangeMeters: number;
  } {
    const spec = this.getDroneSpec(track);
    const enduranceSeconds = spec.batteryMinutes * 60 * 0.8;
    const calmRangeMeters = spec.topSpeedMs * enduranceSeconds;
    if (!this.weatherSnapshot) {
      return {
        centerLatitude: track.latitude,
        centerLongitude: track.longitude,
        semiMajorAxis: calmRangeMeters,
        semiMinorAxis: calmRangeMeters,
        rotationRadians: 0,
        windDriftMeters: 0,
        layerMeters: track.altitudeMeters,
        downwindRangeMeters: calmRangeMeters,
        upwindRangeMeters: calmRangeMeters
      };
    }

    const windSpeedMs = Math.max(0, this.weatherSnapshot.altitudeWindSpeedMs);
    const windBearingDegrees = (this.weatherSnapshot.altitudeWindDirectionDegrees + 180) % 360;
    const windDriftMeters = windSpeedMs * enduranceSeconds;
    const downwindSpeedMs = Math.max(0, spec.topSpeedMs + windSpeedMs);
    const upwindSpeedMs = Math.max(0, spec.topSpeedMs - windSpeedMs);
    const crosswindSpeedMs = Math.max(0, spec.topSpeedMs);
    const downwindRangeMeters = downwindSpeedMs * enduranceSeconds;
    const upwindRangeMeters = upwindSpeedMs * enduranceSeconds;
    const crosswindRangeMeters = crosswindSpeedMs * enduranceSeconds;
    const semiMajorAxis = Math.max(calmRangeMeters * 0.5, (downwindRangeMeters + upwindRangeMeters) / 2);
    const centerOffsetMeters = Math.max(0, (downwindRangeMeters - upwindRangeMeters) / 2);
    const shiftedCenter = this.projectCoordinate(track.latitude, track.longitude, windBearingDegrees, centerOffsetMeters);

    return {
      centerLatitude: shiftedCenter.latitude,
      centerLongitude: shiftedCenter.longitude,
      semiMajorAxis,
      semiMinorAxis: Math.max(calmRangeMeters * 0.45, Math.min(downwindRangeMeters, crosswindRangeMeters)),
      rotationRadians: windBearingDegrees * Math.PI / 180,
      windDriftMeters,
      layerMeters: this.weatherSnapshot.altitudeLayerMeters,
      downwindRangeMeters,
      upwindRangeMeters
    };
  }

  private calculateBearingDegrees(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
    const lat1 = latitudeA * Math.PI / 180;
    const lat2 = latitudeB * Math.PI / 180;
    const deltaLon = (longitudeB - longitudeA) * Math.PI / 180;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  private calculateDistanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
    const metersPerDegree = 111320;
    const deltaLatMeters = (latitudeB - latitudeA) * metersPerDegree;
    const deltaLonMeters = (longitudeB - longitudeA) * metersPerDegree * Math.cos(((latitudeA + latitudeB) / 2) * Math.PI / 180);
    return Math.sqrt((deltaLatMeters * deltaLatMeters) + (deltaLonMeters * deltaLonMeters));
  }

  private projectCoordinate(
    latitude: number,
    longitude: number,
    bearingDegrees: number,
    distanceMeters: number
  ): { latitude: number; longitude: number } {
    const angularDistance = distanceMeters / 6378137;
    const bearingRadians = bearingDegrees * Math.PI / 180;
    const latitudeRadians = latitude * Math.PI / 180;
    const longitudeRadians = longitude * Math.PI / 180;

    const destinationLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularDistance) +
      Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians)
    );

    const destinationLongitude = longitudeRadians + Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
      Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude)
    );

    return {
      latitude: destinationLatitude * 180 / Math.PI,
      longitude: ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180
    };
  }

  private createGroundEllipseBoundary(
    centerLatitude: number,
    centerLongitude: number,
    semiMajorAxis: number,
    semiMinorAxis: number,
    rotationRadians = 0,
    samples = 96
  ): any[] {
    if (!this.cesium) {
      return [];
    }

    const positions: any[] = [];
    const latitudeRadians = centerLatitude * Math.PI / 180;
    const metersPerDegreeLatitude = 111320;
    const metersPerDegreeLongitude = Math.max(1, Math.cos(latitudeRadians) * 111320);

    for (let index = 0; index <= samples; index += 1) {
      const theta = (index / samples) * Math.PI * 2;
      const localEast = semiMajorAxis * Math.cos(theta);
      const localNorth = semiMinorAxis * Math.sin(theta);
      const rotatedEast = localEast * Math.cos(rotationRadians) - localNorth * Math.sin(rotationRadians);
      const rotatedNorth = localEast * Math.sin(rotationRadians) + localNorth * Math.cos(rotationRadians);
      const latitude = centerLatitude + (rotatedNorth / metersPerDegreeLatitude);
      const longitude = centerLongitude + (rotatedEast / metersPerDegreeLongitude);
      positions.push(this.cesium.Cartesian3.fromDegrees(longitude, latitude));
    }

    return positions;
  }

  private getTrackDisplayAltitudeMeters(track: Track): number {
    return Math.max(track.altitudeMeters ?? 0, 30);
  }

  private getTerrainHeightMeters(latitude: number, longitude: number): number {
    if (!this.cesium || !this.viewer) {
      return 0;
    }

    const cacheKey = `${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
    const cachedHeight = this.terrainHeightByCellKey.get(cacheKey);
    if (cachedHeight != null) {
      return cachedHeight;
    }

    const cartographic = this.cesium.Cartographic.fromDegrees(longitude, latitude);
    const sampledGlobeHeight = this.viewer.scene.globe?.getHeight(cartographic);
    const resolvedHeight = Math.max(0, sampledGlobeHeight ?? 0);
    this.terrainHeightByCellKey.set(cacheKey, resolvedHeight);
    return resolvedHeight;
  }

  private createAirPosition(latitude: number, longitude: number, altitudeAboveGroundMeters: number): any {
    if (!this.cesium) {
      return undefined;
    }

    const heightMeters = this.getTerrainHeightMeters(latitude, longitude) + Math.max(0, altitudeAboveGroundMeters);
    return this.cesium.Cartesian3.fromDegrees(longitude, latitude, heightMeters);
  }

  private createSurfacePosition(latitude: number, longitude: number): any {
    if (!this.cesium) {
      return undefined;
    }

    return this.cesium.Cartesian3.fromDegrees(longitude, latitude, this.getTerrainHeightMeters(latitude, longitude));
  }

  private createAerialPathPositions(
    startLatitude: number,
    startLongitude: number,
    startAltitudeMeters: number,
    endLatitude: number,
    endLongitude: number,
    endAltitudeMeters: number,
    samples = 24
  ): any[] {
    if (!this.cesium) {
      return [];
    }

    const positions: any[] = [];
    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples;
      const latitude = startLatitude + ((endLatitude - startLatitude) * t);
      const longitude = startLongitude + ((endLongitude - startLongitude) * t);
      const altitudeAboveGroundMeters = startAltitudeMeters + ((endAltitudeMeters - startAltitudeMeters) * t);
      positions.push(this.createAirPosition(latitude, longitude, altitudeAboveGroundMeters));
    }

    return positions;
  }

  private upsertViewerEntity(id: string, create: () => any, update: (entity: any) => void): void {
    if (!this.viewer) {
      return;
    }

    const existingEntity = this.viewer.entities.getById(id);
    if (existingEntity) {
      update(existingEntity);
      return;
    }

    this.viewer.entities.add(create());
  }

  private syncCommandOverlayEntitySet(activeIds: Set<string>): void {
    if (!this.viewer) {
      this.commandOverlayEntityIds = activeIds;
      return;
    }

    this.commandOverlayEntityIds.forEach(id => {
      if (activeIds.has(id)) {
        return;
      }

      const entity = this.viewer?.entities.getById(id);
      if (entity) {
        this.viewer?.entities.remove(entity);
      }
    });

    this.commandOverlayEntityIds = activeIds;
  }

  private createCommandProfilePositions(
    startLatitude: number,
    startLongitude: number,
    startAltitudeMeters: number,
    cruiseAltitudeMeters: number,
    endLatitude: number,
    endLongitude: number,
    endAltitudeMeters: number
  ): any[] {
    const totalDistanceMeters = this.calculateDistanceMeters(startLatitude, startLongitude, endLatitude, endLongitude);
    if (totalDistanceMeters <= 1) {
      return this.createAerialPathPositions(
        startLatitude,
        startLongitude,
        startAltitudeMeters,
        endLatitude,
        endLongitude,
        endAltitudeMeters,
        8
      );
    }

    const cruiseStartFraction = 0.22;
    const cruiseEndFraction = 0.78;
    const climbStart = {
      latitude: startLatitude,
      longitude: startLongitude,
      altitudeMeters: startAltitudeMeters
    };
    const cruiseEntry = {
      latitude: startLatitude + ((endLatitude - startLatitude) * cruiseStartFraction),
      longitude: startLongitude + ((endLongitude - startLongitude) * cruiseStartFraction),
      altitudeMeters: cruiseAltitudeMeters
    };
    const cruiseExit = {
      latitude: startLatitude + ((endLatitude - startLatitude) * cruiseEndFraction),
      longitude: startLongitude + ((endLongitude - startLongitude) * cruiseEndFraction),
      altitudeMeters: cruiseAltitudeMeters
    };
    const descentEnd = {
      latitude: endLatitude,
      longitude: endLongitude,
      altitudeMeters: endAltitudeMeters
    };

    return [
      ...this.createAerialPathPositions(
        climbStart.latitude,
        climbStart.longitude,
        climbStart.altitudeMeters,
        cruiseEntry.latitude,
        cruiseEntry.longitude,
        cruiseEntry.altitudeMeters,
        8
      ).slice(0, -1),
      ...this.createAerialPathPositions(
        cruiseEntry.latitude,
        cruiseEntry.longitude,
        cruiseEntry.altitudeMeters,
        cruiseExit.latitude,
        cruiseExit.longitude,
        cruiseExit.altitudeMeters,
        10
      ).slice(0, -1),
      ...this.createAerialPathPositions(
        cruiseExit.latitude,
        cruiseExit.longitude,
        cruiseExit.altitudeMeters,
        descentEnd.latitude,
        descentEnd.longitude,
        descentEnd.altitudeMeters,
        8
      )
    ];
  }

  private createDirectionalReachPolygon(track: Track, samples = 180): {
    positions: any[];
    polygonHierarchy: any;
    spokePositions: any[][];
    downwindRangeMeters: number;
    upwindRangeMeters: number;
    crosswindRangeMeters: number;
    labelLatitude: number;
    labelLongitude: number;
  } {
    const layers = this.getOperationalWeatherLayers(track);
    const spec = this.getDroneSpec(track);
    const primaryWindLayer = layers.find(layer => Math.abs(layer.altitudeMeters - track.altitudeMeters) < 80) ?? layers[0];
    const windBearingDegrees = primaryWindLayer ? (primaryWindLayer.windDirectionDegrees + 180) % 360 : 0;

    const coordinates: Array<{ latitude: number; longitude: number }> = [];
    for (let index = 0; index < samples; index += 1) {
      const trackBearingDegrees = (index / samples) * 360;
      const directionalRangeMeters = this.calculateBestRangeMetersForBearing(track, trackBearingDegrees);
      const coordinate = this.projectCoordinate(track.latitude, track.longitude, trackBearingDegrees, directionalRangeMeters);
      coordinates.push(coordinate);
    }

    const positions = coordinates.map(coordinate =>
      this.cesium.Cartesian3.fromDegrees(coordinate.longitude, coordinate.latitude)
    );
    const spokePositions = coordinates
      .filter((_, index) => index % 15 === 0)
      .map(coordinate => [
        this.cesium.Cartesian3.fromDegrees(track.longitude, track.latitude),
        this.cesium.Cartesian3.fromDegrees(coordinate.longitude, coordinate.latitude)
      ]);

    const downwindRangeMeters = this.calculateBestRangeMetersForBearing(track, windBearingDegrees);
    const upwindRangeMeters = this.calculateBestRangeMetersForBearing(track, (windBearingDegrees + 180) % 360);
    const crosswindRangeMeters = this.calculateBestRangeMetersForBearing(track, (windBearingDegrees + 90) % 360);
    const labelPoint = this.projectCoordinate(track.latitude, track.longitude, windBearingDegrees, downwindRangeMeters);

    return {
      positions,
      polygonHierarchy: new this.cesium.PolygonHierarchy(positions),
      spokePositions,
      downwindRangeMeters,
      upwindRangeMeters,
      crosswindRangeMeters,
      labelLatitude: labelPoint.latitude,
      labelLongitude: labelPoint.longitude
    };
  }

  private renderSelectedTrackCommandOverlay(): void {
    if (!this.viewer || !this.cesium || !this.snapshot || !this.selectedTrack) {
      this.syncCommandOverlayEntitySet(new Set<string>());
      return;
    }

    const activeCommandOverlayIds = new Set<string>();
    const track = this.selectedTrack;
    const lineColor = this.cesium.Color.fromCssColorString('#5bd1ff');
    const selectedGroundPosition = this.createSurfacePosition(track.latitude, track.longitude);

    if (this.weatherVisible && this.weatherSnapshot) {
      const weather = this.getWeatherSnapshotForTrack(track) ?? this.weatherSnapshot;
      const windColor = this.cesium.Color.fromCssColorString('#7ad7ff');
      const arrowEnd = this.projectCoordinate(
        track.latitude,
        track.longitude,
        (weather.altitudeWindDirectionDegrees + 180) % 360,
        Math.max(900, Math.min(3200, weather.altitudeWindSpeedMs * 180))
      );
      const arrowBearingDegrees = this.calculateBearingDegrees(
        track.latitude,
        track.longitude,
        arrowEnd.latitude,
        arrowEnd.longitude
      );
      const arrowHeadLengthMeters = Math.max(180, Math.min(420, weather.altitudeWindSpeedMs * 24));
      const arrowHeadLeft = this.projectCoordinate(
        arrowEnd.latitude,
        arrowEnd.longitude,
        (arrowBearingDegrees + 150) % 360,
        arrowHeadLengthMeters
      );
      const arrowHeadRight = this.projectCoordinate(
        arrowEnd.latitude,
        arrowEnd.longitude,
        (arrowBearingDegrees + 210) % 360,
        arrowHeadLengthMeters
      );
      const weatherVectorId = `${track.id}-weather-vector`;
      activeCommandOverlayIds.add(weatherVectorId);
      this.upsertViewerEntity(
        weatherVectorId,
        () => ({
          id: weatherVectorId,
          polyline: {
            positions: [
              selectedGroundPosition,
              this.createSurfacePosition(arrowEnd.latitude, arrowEnd.longitude)
            ],
            width: 1.5,
            material: windColor.withAlpha(0.95)
          }
        }),
        (entity) => {
          entity.polyline.positions = [
            selectedGroundPosition,
            this.createSurfacePosition(arrowEnd.latitude, arrowEnd.longitude)
          ];
        }
      );

      const weatherArrowHeadId = `${track.id}-weather-vector-head`;
      activeCommandOverlayIds.add(weatherArrowHeadId);
      this.upsertViewerEntity(
        weatherArrowHeadId,
        () => ({
          id: weatherArrowHeadId,
          polyline: {
            positions: [
              this.createSurfacePosition(arrowHeadLeft.latitude, arrowHeadLeft.longitude),
              this.createSurfacePosition(arrowEnd.latitude, arrowEnd.longitude),
              this.createSurfacePosition(arrowHeadRight.latitude, arrowHeadRight.longitude)
            ],
            width: 1.5,
            material: windColor.withAlpha(0.95)
          }
        }),
        (entity) => {
          entity.polyline.positions = [
            this.createSurfacePosition(arrowHeadLeft.latitude, arrowHeadLeft.longitude),
            this.createSurfacePosition(arrowEnd.latitude, arrowEnd.longitude),
            this.createSurfacePosition(arrowHeadRight.latitude, arrowHeadRight.longitude)
          ];
        }
      );

      const weatherLabelId = `${track.id}-weather-label`;
      activeCommandOverlayIds.add(weatherLabelId);
      this.upsertViewerEntity(
        weatherLabelId,
        () => ({
          id: weatherLabelId,
          position: this.createSurfacePosition(arrowEnd.latitude, arrowEnd.longitude),
          label: {
            text: `WX ${Math.round(weather.altitudeWindSpeedMs)} m/s toward ${this.formatWindDirection((weather.altitudeWindDirectionDegrees + 180) % 360)}\nCloud ${Math.round(weather.altitudeCloudCoverPercent)}% @ ${Math.round(weather.altitudeLayerMeters)} m`,
            font: 'bold 12px Bahnschrift',
            fillColor: this.cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: this.cesium.Color.fromCssColorString('#082333').withAlpha(0.88),
            pixelOffset: new this.cesium.Cartesian2(0, -18),
            verticalOrigin: this.cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        }),
        (entity) => {
          entity.position = this.createSurfacePosition(arrowEnd.latitude, arrowEnd.longitude);
          entity.label.text = `WX ${Math.round(weather.altitudeWindSpeedMs)} m/s toward ${this.formatWindDirection((weather.altitudeWindDirectionDegrees + 180) % 360)}\nCloud ${Math.round(weather.altitudeCloudCoverPercent)}% @ ${Math.round(weather.altitudeLayerMeters)} m`;
        }
      );
    }

    if ((track.behavior === 'Move To Position' || track.behavior === 'Surveil Location') &&
      track.commandLatitude != null &&
      track.commandLongitude != null) {
      const commandLatitude = track.commandLatitude;
      const commandLongitude = track.commandLongitude;
      const cruiseAltitudeMeters = Math.max(track.commandCruiseAltitudeMeters ?? this.getTrackDisplayAltitudeMeters(track), 30);
      const destinationAltitudeMeters = track.behavior === 'Move To Position' ? cruiseAltitudeMeters : this.getTrackDisplayAltitudeMeters(track);
      const destination = this.createAirPosition(commandLatitude, commandLongitude, destinationAltitudeMeters);
      const destinationGroundPosition = this.createSurfacePosition(commandLatitude, commandLongitude);
      const commandVectorId = `${track.id}-command-vector`;
      activeCommandOverlayIds.add(commandVectorId);
      this.upsertViewerEntity(
        commandVectorId,
        () => ({
          id: commandVectorId,
          polyline: {
            positions: [selectedGroundPosition, destinationGroundPosition],
            width: 1,
            material: lineColor.withAlpha(0.9)
          }
        }),
        (entity) => {
          entity.polyline.positions = [selectedGroundPosition, destinationGroundPosition];
        }
      );

      const commandLineId = `${track.id}-command-line`;
      activeCommandOverlayIds.add(commandLineId);
      this.upsertViewerEntity(
        commandLineId,
        () => ({
          id: commandLineId,
          polyline: {
            positions: this.createCommandProfilePositions(
              track.latitude,
              track.longitude,
              this.getTrackDisplayAltitudeMeters(track),
              cruiseAltitudeMeters,
              commandLatitude,
              commandLongitude,
              destinationAltitudeMeters
            ),
            width: 3,
            material: lineColor.withAlpha(0.9)
          }
        }),
        (entity) => {
          entity.polyline.positions = this.createCommandProfilePositions(
            track.latitude,
            track.longitude,
            this.getTrackDisplayAltitudeMeters(track),
            cruiseAltitudeMeters,
            commandLatitude,
            commandLongitude,
            destinationAltitudeMeters
          );
        }
      );

      const commandAnchorId = `${track.id}-command-line-ground-anchor`;
      activeCommandOverlayIds.add(commandAnchorId);
      this.upsertViewerEntity(
        commandAnchorId,
        () => ({
          id: commandAnchorId,
          polyline: {
            positions: [destinationGroundPosition, destination],
            width: 2,
            material: lineColor.withAlpha(0.5)
          }
        }),
        (entity) => {
          entity.polyline.positions = [destinationGroundPosition, destination];
        }
      );

      if (track.behavior === 'Move To Position' && (track.commandCruiseAltitudeMeters || track.commandEffectiveRangeMeters)) {
        const commandLabelId = `${track.id}-command-move-label`;
        activeCommandOverlayIds.add(commandLabelId);
        this.upsertViewerEntity(
          commandLabelId,
          () => ({
            id: commandLabelId,
            position: destination,
            label: {
              text: `Cruise ${Math.round(track.commandCruiseAltitudeMeters ?? track.altitudeMeters)} m\nRange ${Math.round(track.commandEffectiveRangeMeters ?? 0)} m`,
              font: 'bold 12px Bahnschrift',
              fillColor: this.cesium.Color.WHITE,
              showBackground: true,
              backgroundColor: this.cesium.Color.fromCssColorString('#06281d').withAlpha(0.82),
              pixelOffset: new this.cesium.Cartesian2(0, -18),
              verticalOrigin: this.cesium.VerticalOrigin.BOTTOM,
              horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          }),
          (entity) => {
            entity.position = destination;
            entity.label.text = `Cruise ${Math.round(track.commandCruiseAltitudeMeters ?? track.altitudeMeters)} m\nRange ${Math.round(track.commandEffectiveRangeMeters ?? 0)} m`;
          }
        );
      }

      if (track.behavior === 'Surveil Location' && track.commandRadiusMeters) {
      this.viewer.entities.add({
        id: `${track.id}-command-radius`,
        position: this.cesium.Cartesian3.fromDegrees(commandLongitude, commandLatitude),
        ellipse: {
          semiMajorAxis: track.commandRadiusMeters,
          semiMinorAxis: track.commandRadiusMeters,
          height: 0,
          heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
          material: this.cesium.Color.TRANSPARENT,
          outline: false
        },
          polyline: {
            positions: this.createGroundEllipseBoundary(
              commandLatitude,
              commandLongitude,
              track.commandRadiusMeters,
              track.commandRadiusMeters
            ),
            width: 3,
            clampToGround: true,
            material: lineColor.withAlpha(0.88)
          }
        });
      }
    }

    if ((track.behavior === 'Surveil Track' || track.behavior === 'Engage Track') && track.commandTargetTrackId) {
      const target = this.snapshot.tracks.find(item => item.id === track.commandTargetTrackId);
      if (target) {
        const targetGroundPosition = this.createSurfacePosition(target.latitude, target.longitude);
        const targetAirPosition = this.createAirPosition(
          target.latitude,
          target.longitude,
          this.getTrackDisplayAltitudeMeters(target)
        );
        const targetColor = this.cesium.Color.fromCssColorString(track.behavior === 'Engage Track' ? '#ff5f7d' : '#5bd1ff');
        const targetVectorId = `${track.id}-target-vector`;
        activeCommandOverlayIds.add(targetVectorId);
        this.upsertViewerEntity(
          targetVectorId,
          () => ({
            id: targetVectorId,
            polyline: {
              positions: [selectedGroundPosition, targetGroundPosition],
              width: 1,
              material: targetColor.withAlpha(0.9)
            }
          }),
          (entity) => {
            entity.polyline.positions = [selectedGroundPosition, targetGroundPosition];
          }
        );

        const targetLineId = `${track.id}-target-line`;
        activeCommandOverlayIds.add(targetLineId);
        this.upsertViewerEntity(
          targetLineId,
          () => ({
            id: targetLineId,
            polyline: {
              positions: this.createCommandProfilePositions(
                track.latitude,
                track.longitude,
                this.getTrackDisplayAltitudeMeters(track),
                Math.max(track.commandCruiseAltitudeMeters ?? this.getTrackDisplayAltitudeMeters(track), 30),
                target.latitude,
                target.longitude,
                this.getTrackDisplayAltitudeMeters(target)
              ),
              width: 3,
              material: targetColor.withAlpha(0.9)
            }
          }),
          (entity) => {
            entity.polyline.positions = this.createCommandProfilePositions(
              track.latitude,
              track.longitude,
              this.getTrackDisplayAltitudeMeters(track),
              Math.max(track.commandCruiseAltitudeMeters ?? this.getTrackDisplayAltitudeMeters(track), 30),
              target.latitude,
              target.longitude,
              this.getTrackDisplayAltitudeMeters(target)
            );
          }
        );

        const targetAnchorId = `${track.id}-target-line-ground-anchor`;
        activeCommandOverlayIds.add(targetAnchorId);
        this.upsertViewerEntity(
          targetAnchorId,
          () => ({
            id: targetAnchorId,
            polyline: {
              positions: [targetGroundPosition, targetAirPosition],
              width: 2,
              material: targetColor.withAlpha(0.5)
            }
          }),
          (entity) => {
            entity.polyline.positions = [targetGroundPosition, targetAirPosition];
          }
        );

        if (track.behavior === 'Surveil Track' && track.commandRadiusMeters) {
          this.viewer.entities.add({
            id: `${track.id}-target-radius`,
            position: this.cesium.Cartesian3.fromDegrees(target.longitude, target.latitude),
            ellipse: {
              semiMajorAxis: track.commandRadiusMeters,
              semiMinorAxis: track.commandRadiusMeters,
              height: 0,
              heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
              material: this.cesium.Color.TRANSPARENT,
              outline: false
            },
            polyline: {
              positions: this.createGroundEllipseBoundary(
                target.latitude,
                target.longitude,
                track.commandRadiusMeters,
                track.commandRadiusMeters
              ),
              width: 3,
              clampToGround: true,
              material: lineColor.withAlpha(0.86)
            }
          });
        }
      }
    }

    if (this.weatherVisible || (this.behaviorPlacementMode === 'Move To Position' && this.behaviorPlacementPreviewLocation)) {
      const reachPolygon = this.createDirectionalReachPolygon(track);
      const closedReachPositions = [...reachPolygon.positions, reachPolygon.positions[0]];
      reachPolygon.spokePositions.forEach((spokePositions, index) => {
        this.viewer?.entities.add({
          id: `${track.id}-range-spoke-${index}`,
          polyline: {
            positions: spokePositions,
            width: 1.5,
            clampToGround: true,
            material: this.cesium.Color.fromCssColorString('#71ebc0').withAlpha(0.28)
          }
        });
      });
      const rangeGlowId = `${track.id}-range-ring-glow`;
      activeCommandOverlayIds.add(rangeGlowId);
      this.upsertViewerEntity(
        rangeGlowId,
        () => ({
          id: rangeGlowId,
          polyline: {
            positions: closedReachPositions,
            width: 10,
            clampToGround: true,
            material: this.cesium.Color.fromCssColorString('#71ebc0').withAlpha(0.14)
          }
        }),
        (entity) => {
          entity.polyline.positions = closedReachPositions;
        }
      );

      const rangeRingId = `${track.id}-range-ring`;
      activeCommandOverlayIds.add(rangeRingId);
      this.upsertViewerEntity(
        rangeRingId,
        () => ({
          id: rangeRingId,
          polyline: {
            positions: closedReachPositions,
            width: 7,
            clampToGround: true,
            material: this.cesium.Color.fromCssColorString('#71ebc0').withAlpha(0.68)
          }
        }),
        (entity) => {
          entity.polyline.positions = closedReachPositions;
        }
      );

      const rangeLabelId = `${track.id}-range-label`;
      const rangeLabelText = this.getWeatherSnapshotForTrack(track)
        ? `Downwind ${Math.round(reachPolygon.downwindRangeMeters)} m | Upwind ${Math.round(reachPolygon.upwindRangeMeters)} m\nCrosswind ${Math.round(reachPolygon.crosswindRangeMeters)} m`
        : `Potential range ${Math.round(reachPolygon.downwindRangeMeters)} m`;
      activeCommandOverlayIds.add(rangeLabelId);
      this.upsertViewerEntity(
        rangeLabelId,
        () => ({
          id: rangeLabelId,
          position: this.createSurfacePosition(reachPolygon.labelLatitude, reachPolygon.labelLongitude),
          label: {
            text: rangeLabelText,
            font: 'bold 12px Bahnschrift',
            fillColor: this.cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: this.cesium.Color.fromCssColorString('#06281d').withAlpha(0.82),
            pixelOffset: new this.cesium.Cartesian2(0, -20),
            verticalOrigin: this.cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        }),
        (entity) => {
          entity.position = this.createSurfacePosition(reachPolygon.labelLatitude, reachPolygon.labelLongitude);
          entity.label.text = rangeLabelText;
        }
      );
    }

    if (this.behaviorPlacementMode === 'Move To Position' && this.behaviorPlacementPreviewLocation) {
      const previewGroundPosition = this.createSurfacePosition(
        this.behaviorPlacementPreviewLocation.latitude,
        this.behaviorPlacementPreviewLocation.longitude
      );
      this.viewer.entities.add({
        id: `${track.id}-behavior-preview-vector`,
        polyline: {
          positions: [selectedGroundPosition, previewGroundPosition],
          width: 6,
          material: new this.cesium.PolylineArrowMaterialProperty(
            this.cesium.Color.fromCssColorString('#ffd36b').withAlpha(0.95)
          )
        }
      });
    }

    this.syncCommandOverlayEntitySet(activeCommandOverlayIds);
  }

  private renderScene(): void {
    if (!this.viewer || !this.cesium || !this.snapshot) {
      return;
    }

    const canvasHost = document.getElementById('globe');
    if (!canvasHost || canvasHost.clientWidth <= 0 || canvasHost.clientHeight <= 0) {
      return;
    }

    this.handleResize();
    this.removeTransientSceneEntities();
    this.syncPersistentSceneEntities();

    this.renderSelectedTrackCommandOverlay();
    this.syncGeofencePreviewEntity();
    this.syncTrackPlacementPreviewEntity();
    this.syncBehaviorPlacementPreviewEntity();
    this.viewer.scene.requestRender();
  }

  private syncPersistentSceneEntities(): void {
    if (!this.viewer || !this.cesium || !this.snapshot) {
      return;
    }

    const activePersistentIds = new Set<string>();
    for (const site of this.snapshot.protectedSites) {
      const selected = site.id === this.selectedSiteId;
      activePersistentIds.add(site.id);
      const position = this.cesium.Cartesian3.fromDegrees(site.longitude, site.latitude);
      const existingSiteEntity = this.viewer.entities.getById(site.id);
      if (existingSiteEntity) {
        existingSiteEntity.position = position;
        existingSiteEntity.polyline.positions = this.createGroundEllipseBoundary(
          site.latitude,
          site.longitude,
          site.radiusMeters,
          site.radiusMeters
        );
        existingSiteEntity.polyline.width = selected ? 4 : 3;
        existingSiteEntity.polyline.material =
          this.cesium.Color.fromCssColorString(selected ? '#ffd36b' : '#9fe4ff').withAlpha(selected ? 0.96 : 0.8);
        existingSiteEntity.label.text = site.name;
        existingSiteEntity.label.font = selected ? 'bold 13px Bahnschrift' : '12px Bahnschrift';
        existingSiteEntity.label.backgroundColor =
          this.cesium.Color.fromCssColorString(selected ? '#3a2604' : '#04111d').withAlpha(0.78);
      } else {
        this.viewer.entities.add({
          id: site.id,
          position,
          ellipse: {
            semiMajorAxis: site.radiusMeters,
            semiMinorAxis: site.radiusMeters,
            height: 0,
            heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
            material: this.cesium.Color.TRANSPARENT,
            outline: false
          },
          polyline: {
            positions: this.createGroundEllipseBoundary(
              site.latitude,
              site.longitude,
              site.radiusMeters,
              site.radiusMeters
            ),
            width: selected ? 4 : 3,
            clampToGround: true,
            material: this.cesium.Color.fromCssColorString(selected ? '#ffd36b' : '#9fe4ff').withAlpha(selected ? 0.96 : 0.8)
          },
          label: {
            text: site.name,
            font: selected ? 'bold 13px Bahnschrift' : '12px Bahnschrift',
            fillColor: this.cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: this.cesium.Color.fromCssColorString(selected ? '#3a2604' : '#04111d').withAlpha(0.78),
            pixelOffset: new this.cesium.Cartesian2(0, -26),
            heightReference: this.cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
      }
    }

    for (const track of this.snapshot.tracks) {
      const color = this.colorForAlert(track.alertLevel);
      const selected = track.id === this.selectedTrackId;
      const trackHeightAboveGround = this.getTrackDisplayAltitudeMeters(track);
      const stemLength = Math.max(trackHeightAboveGround, 30);
      const stemMidpoint = stemLength / 2;
      const stemId = `${track.id}-stem`;
      activePersistentIds.add(stemId);
      activePersistentIds.add(track.id);

      const stemPosition = this.createAirPosition(track.latitude, track.longitude, stemMidpoint);
      const existingStemEntity = this.viewer.entities.getById(stemId);
      if (existingStemEntity) {
        existingStemEntity.position = stemPosition;
        existingStemEntity.cylinder.length = stemLength;
        existingStemEntity.cylinder.topRadius = selected ? 10 : 7;
        existingStemEntity.cylinder.bottomRadius = selected ? 10 : 7;
        existingStemEntity.cylinder.material = color.withAlpha(selected ? 0.82 : 0.58);
      } else {
        this.viewer.entities.add({
          id: stemId,
          position: stemPosition,
          cylinder: {
            length: stemLength,
            topRadius: selected ? 10 : 7,
            bottomRadius: selected ? 10 : 7,
            material: color.withAlpha(selected ? 0.82 : 0.58),
            outline: false
          }
        });
      }

      const trackPosition = this.createAirPosition(track.latitude, track.longitude, trackHeightAboveGround);
      const existingTrackEntity = this.viewer.entities.getById(track.id);
      const visualStateKey = this.getTrackVisualStateKey(track, selected);
      const labelStateKey = this.getTrackLabelStateKey(track, selected);
      if (existingTrackEntity) {
        existingTrackEntity.position = trackPosition;
        if (this.trackVisualStateById.get(track.id) !== visualStateKey) {
          existingTrackEntity.billboard.image = this.createMilStd2525TrackSymbol(track, selected);
          existingTrackEntity.billboard.scale = selected ? 0.78 : 0.68;
          this.trackVisualStateById.set(track.id, visualStateKey);
        }
        if (this.trackLabelStateById.get(track.id) !== labelStateKey) {
          existingTrackEntity.label.text = `${track.callsign}\n${track.alertLevel.toUpperCase()}`;
          existingTrackEntity.label.font = selected ? 'bold 13px Bahnschrift' : '12px Bahnschrift';
          this.trackLabelStateById.set(track.id, labelStateKey);
        }
      } else {
        this.viewer.entities.add({
          id: track.id,
          position: trackPosition,
          billboard: {
            image: this.createMilStd2525TrackSymbol(track, selected),
            scale: selected ? 0.78 : 0.68,
            verticalOrigin: this.cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: `${track.callsign}\n${track.alertLevel.toUpperCase()}`,
            font: selected ? 'bold 13px Bahnschrift' : '12px Bahnschrift',
            fillColor: this.cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: this.cesium.Color.fromCssColorString('#030b14').withAlpha(0.82),
            pixelOffset: new this.cesium.Cartesian2(0, -40),
            verticalOrigin: this.cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: this.cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        this.trackVisualStateById.set(track.id, visualStateKey);
        this.trackLabelStateById.set(track.id, labelStateKey);
      }
    }
    const idsToRemove: string[] = [];
    this.viewer.entities.values.forEach((entity: any) => {
      const entityId = entity.id;
      if (typeof entityId !== 'string') {
        return;
      }

      if (entityId === this.geofencePreviewEntityId ||
          entityId === this.trackPlacementPreviewEntityId ||
          entityId === this.behaviorPlacementPreviewEntityId) {
        return;
      }

      if (activePersistentIds.has(entityId) || this.isTransientSceneEntityId(entityId) || this.commandOverlayEntityIds.has(entityId)) {
        return;
      }

      if (entityId.startsWith('trk-') || entityId.startsWith('site-')) {
        idsToRemove.push(entityId);
      }
    });

    idsToRemove.forEach(id => {
      const entity = this.viewer?.entities.getById(id);
      if (entity) {
        this.viewer?.entities.remove(entity);
      }
      this.trackVisualStateById.delete(id);
      this.trackLabelStateById.delete(id);
    });
  }

  private removeTransientSceneEntities(): void {
    if (!this.viewer) {
      return;
    }

    const idsToRemove: string[] = [];
    this.viewer.entities.values.forEach((entity: any) => {
      const entityId = entity.id;
      if (typeof entityId === 'string' && this.isTransientSceneEntityId(entityId)) {
        idsToRemove.push(entityId);
      }
    });

    idsToRemove.forEach(id => {
      const entity = this.viewer?.entities.getById(id);
      if (entity) {
        this.viewer?.entities.remove(entity);
      }
    });
  }

  private isTransientSceneEntityId(entityId: string): boolean {
    return entityId.endsWith('-command-radius') ||
      entityId.endsWith('-target-radius') ||
      entityId.endsWith('-behavior-preview-vector') ||
      entityId.includes('-range-spoke-');
  }

  private colorForAlert(alertLevel: string): any {
    if (!this.cesium) {
      return undefined;
    }

    switch (alertLevel.toLowerCase()) {
      case 'high':
        return this.cesium.Color.fromCssColorString('#ff5f7d');
      case 'elevated':
        return this.cesium.Color.fromCssColorString('#ffb347');
      default:
        return this.cesium.Color.fromCssColorString('#40d3a6');
    }
  }
}
