import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AirPictureStreamService } from './services/air-picture-stream.service';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [FormsModule, HttpClientTestingModule],
      providers: [
        {
          provide: AirPictureStreamService,
          useValue: {
            connect: () => of()
          }
        }
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should retrieve the air picture snapshot from the server', () => {
    const mockSnapshot = {
      generatedAtUtc: '2026-03-23T12:00:00Z',
      tracks: [],
      protectedSites: [],
      availableCommands: [],
      actionLog: [],
      transportStatus: {
        tcpPort: 5055,
        listenerOnline: true,
        connectedClients: 0,
        lastError: ''
      }
    };

    component.ngOnInit();

    const req = httpMock.expectOne('/api/air-picture');
    expect(req.request.method).toEqual('GET');
    req.flush(mockSnapshot);

    expect(component.snapshot).toEqual(mockSnapshot);
  });
});
