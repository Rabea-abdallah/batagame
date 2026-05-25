const CACHE_NAME = 'batta-uno-v34';
const ASSETS = [
  './',
  './index.html',
  './lobby.html',
  './game.html',
  './manifest.json',
  './assets/css/variables.css',
  './assets/css/reset.css',
  './assets/css/components.css',
  './assets/css/home.css',
  './assets/css/lobby.css',
  './assets/css/game.css',
  './assets/css/animations.css',
  './assets/js/App.js',
  './assets/js/core/EventSystem.js',
  './assets/js/core/Constants.js',
  './assets/js/core/Validator.js',
  './assets/js/game/Card.js',
  './assets/js/game/Deck.js',
  './assets/js/game/GameRules.js',
  './assets/js/game/GameState.js',
  './assets/js/game/Scoring.js',
  './assets/js/game/BotAI.js',
  './assets/js/network/PeerConnection.js',
  './assets/js/network/RoomManager.js',
  './assets/js/network/SyncEngine.js',
  './assets/js/network/Heartbeat.js',
  './assets/js/storage/LocalStorage.js',
  './assets/js/storage/IndexedDB.js',
  './assets/js/storage/SessionManager.js',
  './assets/js/ui/HomeUI.js',
  './assets/js/ui/LobbyUI.js',
  './assets/js/ui/GameUI.js',
  './assets/js/ui/CardRenderer.js',
  './assets/js/ui/CardAnimation.js',
  './assets/js/ui/ParticleEffects.js',
  './assets/js/ui/Notification.js',
  './assets/js/utils/helpers.js',
  './assets/js/utils/SoundManager.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
