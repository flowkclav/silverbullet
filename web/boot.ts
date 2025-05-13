import { safeRun } from "$lib/async.ts";
import { Client, type ClientConfig } from "./client.ts";

safeRun(async () => {
  // First we fetch the client config from the server (or cached via service worker)
  let clientConfig: ClientConfig | undefined;

  // Read any previous client config from localStorage to be used as default if
  // network/server is down. (The service worker is not started yet so is
  // unable to read from cache)
  if (localStorage) {
    try {
      const cfvalue = localStorage.getItem(
        `silverbullet.${document.baseURI}.config`,
      );
      if (cfvalue) {
        clientConfig = JSON.parse(cfvalue);
        console.log("Read client config from localStorage");
      }
    } catch (e: any) {
      console.log("Failed to parse client config from localStorage", e);
    }
  }

  try {
    const configResponse = await fetch("/.config", {
      // We don't want to follow redirects, we want to get the redirect header in case of auth issues
      redirect: "manual",
    });
    const redirectHeader = configResponse.headers.get("location");
    if (
      configResponse.status === 401 && redirectHeader
    ) {
      alert(
        "Received an authentication redirect, redirecting to URL: " +
          redirectHeader,
      );
      location.href = redirectHeader;
      return;
    }
    clientConfig = await configResponse.json();
    if (localStorage) {
      localStorage.setItem(
        `silverbullet.${document.baseURI}.config`,
        JSON.stringify(clientConfig),
      );
    }
  } catch (e: any) {
    console.error("Failed to fetch client config", e.message);
    if (!clientConfig) {
      alert(
        "Could not fetch configuration from server. Make sure you have an internet connection.",
      );
      return;
    }
  }
  console.log("Client config", clientConfig);
  console.log("Booting SilverBullet client");

  if (clientConfig!.readOnly) {
    console.log("Running in read-only mode");
  }
  if (navigator.serviceWorker) {
    // Register service worker
    navigator.serviceWorker
      .register(new URL("/service_worker.js", location.href), {
        type: "module",
      })
      .then((registration) => {
        console.log("Service worker registered...");

        // Set up update detection
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          console.log("New service worker installing...");

          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                console.log(
                  "New service worker installed and ready to take over.",
                );
                // Force the new service worker to activate immediately
                newWorker.postMessage({ type: "skipWaiting" });
              }
            });
          }
        });
      });

    // Handle service worker controlled changes (when a new service worker takes over)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        console.log(
          "New service worker activated, please reload to activate the new version.",
        );
      }
    });

    navigator.serviceWorker.ready.then((registration) => {
      registration.active!.postMessage({
        type: "config",
        config: clientConfig,
      });
    });
  } else {
    console.warn(
      "Not launching service worker, likely because not running from localhost or over HTTPs. This means SilverBullet will not be available offline.",
    );
  }
  const client = new Client(
    document.getElementById("sb-root")!,
    clientConfig!,
  );
  // @ts-ignore: on purpose
  globalThis.client = client;
  await client.init();
});

if (!globalThis.indexedDB) {
  alert(
    "SilverBullet requires IndexedDB to operate and it is not available in your browser. Please use a recent version of Chrome, Firefox (not in private mode) or Safari.",
  );
}
