import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable } from 'rxjs';
import { AirPictureSnapshot } from '../models/c2.models';

@Injectable({ providedIn: 'root' })
export class AirPictureStreamService {
  connect(): Observable<AirPictureSnapshot> {
    return new Observable<AirPictureSnapshot>((subscriber) => {
      const connection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/air-picture')
        .withAutomaticReconnect()
        .build();

      connection.on('airPictureUpdated', (snapshot: AirPictureSnapshot) => {
        subscriber.next(snapshot);
      });

      connection
        .start()
        .catch((error) => subscriber.error(error));

      return () => {
        connection.stop().catch((error) => console.error(error));
      };
    });
  }
}
