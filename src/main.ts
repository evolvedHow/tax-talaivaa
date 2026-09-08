import App from './App.svelte';

const app = new App({ target: document.getElementById('app')! });

// Register the offline/installable service worker in production only.
// BASE_URL keeps the path correct when deployed under a subdirectory.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {});
  });
}

export default app;
