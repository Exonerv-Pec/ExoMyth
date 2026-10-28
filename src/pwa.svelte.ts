/**
 * Exomyth as an installed app that works offline (see src/pwa/worker.ts for the service worker).
 *
 * - The service worker is registered once the app has started, only in the build made for it and
 *   only over https or on this computer (`localhost`), where browsers allow it.
 * - A new version waits in the background. `pwa.updateReady` shows a notice; `pwa.update()` saves
 *   what is being typed, lets the new version take over and reloads.
 * - Browsers that can install web apps offer it through `beforeinstallprompt`; `pwa.install()` asks.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class Pwa {
  /** A new version of the app is downloaded and waits for a reload. */
  updateReady = $state(false);
  /** The browser can install the app now. */
  canInstall = $state(false);
  /** Running as an installed app, in its own window. */
  installed = $state(false);
  /** The app is kept for working offline. */
  offlineReady = $state(false);

  private waiting: ServiceWorker | null = null;
  private prompt: InstallPrompt | null = null;
  private reloading = false;

  /** Starts it all; does nothing where service workers are not available. */
  start(beforeReload: () => Promise<void>): void {
    this.beforeReload = beforeReload;
    try {
      this.installed = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    } catch {
      /* An old browser without display modes. */
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.prompt = e as InstallPrompt;
      this.canInstall = true;
    });
    window.addEventListener('appinstalled', () => {
      this.prompt = null;
      this.canInstall = false;
      this.installed = true;
    });
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && !local)) return;
    void this.register();
  }

  private beforeReload: () => Promise<void> = async () => {};

  private async register(): Promise<void> {
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration;
    try {
      reg = await sw.register('./sw.js', { scope: './' });
    } catch {
      return; // Blocked (private mode in some browsers): the app works online as before.
    }
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        if (worker.state === 'installed') {
          // With an old version in charge this one waits; without one it is simply the first copy.
          if (sw.controller) {
            this.waiting = worker;
            this.updateReady = true;
          } else this.offlineReady = true;
        }
        if (worker.state === 'activated') this.offlineReady = true;
      };
      worker.addEventListener('statechange', check);
      check();
    };
    if (reg.active) this.offlineReady = true;
    watch(reg.waiting);
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    sw.addEventListener('controllerchange', () => {
      if (!this.reloading || !this.waiting) return;
      location.reload();
    });
    // Look for a new version now and then while the app stays open.
    setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
  }

  /** Switches to the new version: saves what is being typed, then reloads. */
  async update(): Promise<void> {
    if (!this.waiting) return;
    await this.beforeReload().catch(() => undefined);
    this.reloading = true;
    this.waiting.postMessage('exomyth:update');
  }

  /** Asks the browser to install the app. */
  async install(): Promise<void> {
    const p = this.prompt;
    if (!p) return;
    this.prompt = null;
    this.canInstall = false;
    await p.prompt();
    // When the person says no, the browser offers it again later by itself.
    await p.userChoice.catch(() => undefined);
  }
}

export const pwa = new Pwa();
