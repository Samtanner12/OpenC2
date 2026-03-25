import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

const cesiumBaseUrl = new URL('assets/cesium/', document.baseURI).pathname;
(window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = cesiumBaseUrl;

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
